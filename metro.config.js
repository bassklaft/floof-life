const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Supabase's realtime client (@supabase/realtime-js) transitively imports
// `ws`, a Node-only WebSocket library that pulls in Node core modules
// (stream, http, …) which don't exist in React Native — Hermes/Metro
// can't resolve them. FloofLife uses Supabase auth / postgrest / storage /
// edge functions only, never realtime, so we resolve `ws` to an empty
// module. realtime-js never opens a socket at runtime, so the empty stub
// is never exercised.
const EMPTY_MODULES = new Set(["ws"]);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (EMPTY_MODULES.has(moduleName)) {
    return { type: "empty" };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
