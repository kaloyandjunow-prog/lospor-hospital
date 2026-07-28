import { StyleSheet, Text, View } from "react-native"
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from "react-native-svg"

const INK = "#f7f8f5"
const AMBER = "#f6ad2f"

export function AuthBackdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 390 844" preserveAspectRatio="xMidYMin slice">
        <Defs>
          <LinearGradient id="auth-light" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={AMBER} stopOpacity={0.16} />
            <Stop offset="0.42" stopColor={AMBER} stopOpacity={0.035} />
            <Stop offset="1" stopColor={AMBER} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d="M145 0h100l78 520H67z" fill="url(#auth-light)" />
      </Svg>
    </View>
  )
}

// Faithful port of the shared brand symbol (lospor-app/public/brand/
// lospor-symbol-dark.svg) — the same mark as the app icon and the web header:
// surgical lamp, monitor, and the anaesthesia machine on its trolley with
// bellows. Keep the geometry in sync with that file; this used to be a
// simplified hand-drawn lamp-and-box that did not match the brand.
export function AuthBrand() {
  return (
    <View style={styles.wrap} accessibilityRole="image" accessibilityLabel="LOSPOR">
      {/* viewBox is centred on the machine's axis (canonical x=400: lamp,
          monitor and trolley all share it), NOT on the artwork's bounding box.
          The bellows hangs off to the left, so a bounding-box fit would pad the
          left and push the machine visibly right of the wordmark. */}
      <Svg width={99} height={158} viewBox="170 62 460 734">
        <G fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round">
          {/* lamp stem + suspension arc */}
          <Path d="M380 70v58m-52 28c17-20 127-20 144 0" />
          <Path d="M266 215c0-53 60-85 134-85s134 32 134 85v37c0 23-60 41-134 41s-134-18-134-41z" />
          {/* monitor */}
          <Rect x={286} y={354} width={228} height={164} rx={23} />
          <Rect x={309} y={377} width={162} height={108} rx={8} />
          <Circle cx={491} cy={451} r={14} />
          <Path strokeWidth={8} d="M486 394h10m-10 21h10" />
          {/* trolley: shelves, drawers, wheels */}
          <Path d="M263 538h274v30H263z" />
          <Path d="M288 568v153h224V568" />
          <Path d="M266 653h268v39H266z" />
          <Path d="M270 721h260v32H270z" />
          <Circle cx={315} cy={770} r={18} />
          <Circle cx={485} cy={770} r={18} />
          <Rect x={317} y={590} width={78} height={96} rx={8} />
          <Circle cx={356} cy={622} r={10} />
          <Rect x={414} y={590} width={64} height={96} rx={8} />
          {/* bellows canister + breathing hose */}
          <Rect x={232} y={601} width={45} height={53} rx={6} />
          <Path strokeWidth={8} d="M232 628c-48 0-58 38-58 71 0 30 8 58 28 58s30-28 30-58c0-19-5-38-15-51" />
          <Path strokeWidth={8} d="M277 632c0 78 19 111 66 111 38 0 65-22 65-62" />
        </G>
        {/* amber light, then the rim redrawn over it (order matters) */}
        <Ellipse cx={400} cy={252} rx={117} ry={39} fill={AMBER} />
        <Path
          d="M271 230c15-23 67-38 129-38s114 15 129 38"
          fill="none" stroke={INK} strokeWidth={12} strokeLinecap="round"
        />
      </Svg>
      <Text style={styles.wordmark}>LOSPOR</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  wordmark: {
    color: INK,
    fontFamily: "Roboto_700Bold",
    fontSize: 32,
    letterSpacing: 0,
    marginTop: -2,
  },
})
