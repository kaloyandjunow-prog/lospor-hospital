const path = require("path")
const { getDefaultConfig } = require("expo/metro-config")
const { withNativeWind } = require("nativewind/metro")

const config = getDefaultConfig(__dirname, {
  isCSSEnabled: true,
})

config.resolver.platforms = ["ios", "android", "native", "web"]

// On web builds, replace expo-secure-store with a localStorage shim.
// The native module returns an empty object on web, causing every call to throw.
const originalResolve = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "expo-secure-store") {
    return {
      filePath: path.resolve(__dirname, "src/lib/secure-store-web.ts"),
      type: "sourceFile",
    }
  }
  if (originalResolve) return originalResolve(context, moduleName, platform)
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: "./global.css" })
