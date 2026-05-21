// ChurnFeedbackGate — decides when to surface ChurnFeedbackModal.
//
// Mounted once inside PurchasesProvider (so it can read RevenueCat
// state) and watches for two triggers:
//   • a cancelled trial / subscription (unsubscribeDetectedAt)
//   • the 2nd app open with no subscription ever held
//
// Each trigger fires at most once — AsyncStorage handled-flags survive
// across launches, and a per-process guard prevents a customerInfo
// listener echo from re-opening the modal. Founder-override devices
// are skipped entirely, and the whole feature stays dormant until the
// backend endpoint is configured (EXPO_PUBLIC_CHURN_FEEDBACK_URL).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePurchases } from "../lib/purchasesContext";
import { track } from "../lib/analytics";
import ChurnFeedbackModal from "./ChurnFeedbackModal";
import {
  isChurnFeedbackConfigured,
  bumpAppOpenCount,
  detectCancellation,
  hasNeverSubscribed,
  getCancelHandledKey,
  markCancelHandled,
  isNoSubHandled,
  markNoSubHandled,
  submitChurnFeedback,
  emailChurnFeedback,
} from "../lib/churnFeedback";

// "after opening the app 2 times" → fire on the 2nd cold start.
const NOSUB_OPEN_THRESHOLD = 2;

export default function ChurnFeedbackGate({ onboarded }) {
  const { customerInfo, isFounderDevice, ready } = usePurchases();

  const [visible, setVisible] = useState(false);
  const [variant, setVariant] = useState("cancel");
  const [status, setStatus] = useState("idle"); // idle | sending | error
  const [openCount, setOpenCount] = useState(null);

  // { kind, unsubKey } context for the 'cancel' variant.
  const cancelCtx = useRef(null);
  // A prompt has been opened this process — block re-triggering.
  const resolved = useRef(false);

  // Bump the app-open counter once per process. openCount is state so
  // its async resolution re-runs the decision effect below.
  useEffect(() => {
    bumpAppOpenCount().then(setOpenCount);
  }, []);

  // Decide whether to open the modal.
  useEffect(() => {
    if (!isChurnFeedbackConfigured()) return; // backend not wired yet → dormant
    if (isFounderDevice) return;              // founders never get churn prompts
    if (!ready || !onboarded) return;
    if (resolved.current || visible) return;
    if (customerInfo == null) return;         // wait for RevenueCat state to load

    let cancelled = false;
    (async () => {
      // ── Trigger 1: cancelled trial / subscription ──────────────────
      const cx = detectCancellation(customerInfo);
      if (cx) {
        const handled = await getCancelHandledKey();
        if (!cancelled && handled !== cx.unsubKey) {
          cancelCtx.current = cx;
          resolved.current = true;
          setVariant("cancel");
          setStatus("idle");
          // Brief delay so the app is settled behind the modal.
          setTimeout(() => { if (!cancelled) setVisible(true); }, 600);
          track("churn_feedback_shown", { variant: "cancel", kind: cx.kind });
        }
        return; // a cancellation exists — never fall through to nosub
      }

      // ── Trigger 2: 2 app opens, never subscribed ───────────────────
      if (openCount == null || openCount < NOSUB_OPEN_THRESHOLD) return;
      if (!hasNeverSubscribed(customerInfo)) return;
      if (await isNoSubHandled()) return;
      if (!cancelled) {
        cancelCtx.current = null;
        resolved.current = true;
        setVariant("nosub");
        setStatus("idle");
        setTimeout(() => { if (!cancelled) setVisible(true); }, 600);
        track("churn_feedback_shown", { variant: "nosub" });
      }
    })();

    return () => { cancelled = true; };
  }, [customerInfo, ready, isFounderDevice, onboarded, openCount, visible]);

  // Persist the handled-flag so the trigger never fires again.
  const persistHandled = useCallback(async () => {
    if (variant === "cancel") {
      await markCancelHandled(cancelCtx.current?.unsubKey || "1");
    } else {
      await markNoSubHandled();
    }
  }, [variant]);

  async function handleSubmit(fields) {
    setStatus("sending");
    const kind = cancelCtx.current?.kind;
    const res = await submitChurnFeedback({ variant, kind, ...fields });
    if (res.ok) {
      track("churn_feedback_sent", {
        variant,
        kind,
        reason_count: fields.reasons?.length || 0,
      });
      await persistHandled();
      setVisible(false);
      setStatus("idle");
    } else {
      // Bounded scalar only — never the user's free text or contact info.
      track("churn_feedback_failed", { variant, error: res.error });
      setStatus("error");
    }
  }

  async function handleEmailFallback(fields) {
    const kind = cancelCtx.current?.kind;
    await emailChurnFeedback({ variant, kind, ...fields });
    track("churn_feedback_emailed", { variant, kind });
    await persistHandled();
    setVisible(false);
    setStatus("idle");
  }

  async function handleClose() {
    track("churn_feedback_dismissed", { variant });
    setVisible(false);
    setStatus("idle");
    await persistHandled();
  }

  return (
    <ChurnFeedbackModal
      visible={visible}
      variant={variant}
      status={status}
      onSubmit={handleSubmit}
      onEmailFallback={handleEmailFallback}
      onClose={handleClose}
    />
  );
}
