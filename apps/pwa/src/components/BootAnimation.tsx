import { useEffect, useRef } from "react"
import { Animated, Easing, StyleSheet, Text, View } from "react-native"
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg"

const INK = "#f7f8f5"
const AMBER = "#f6ad2f"
const BACKGROUND = "#090b0c"

function Lamp() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 520">
      <Path d="M180 34v34" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
      <Path d="M145 89c11-13 59-13 70 0" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
      <Path
        d="M112 123c0-34 30-55 68-55s68 21 68 55v24c0 15-30 27-68 27s-68-12-68-27z"
        fill="none"
        stroke={INK}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <Ellipse cx={180} cy={147} rx={58} ry={20} fill={AMBER} />
      <Path d="M117 135c8-14 33-23 63-23s55 9 63 23" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
    </Svg>
  )
}

function Machine() {
  return (
    <Svg style={StyleSheet.absoluteFill} viewBox="0 0 360 520">
      <Rect x={112} y={213} width={136} height={96} rx={14} fill="none" stroke={INK} strokeWidth={6} />
      <Rect x={126} y={227} width={94} height={61} rx={5} fill="none" stroke={INK} strokeWidth={6} />
      <Circle cx={234} cy={271} r={8} fill="none" stroke={INK} strokeWidth={6} />
      <Path d="M99 323h162v19H99zM114 342v104h132V342M101 394h158v24H101zM104 446h152v18H104z" fill="none" stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      <Circle cx={131} cy={475} r={10} fill="none" stroke={INK} strokeWidth={6} />
      <Circle cx={229} cy={475} r={10} fill="none" stroke={INK} strokeWidth={6} />
      <Rect x={129} y={355} width={47} height={57} rx={5} fill="none" stroke={INK} strokeWidth={6} />
      <Circle cx={152.5} cy={374} r={6} fill="none" stroke={INK} strokeWidth={5} />
      <Rect x={188} y={355} width={38} height={57} rx={5} fill="none" stroke={INK} strokeWidth={6} />
      <Rect x={79} y={362} width={29} height={32} rx={4} fill="none" stroke={INK} strokeWidth={6} />
      <Path d="M79 378c-28 0-34 23-34 44 0 18 5 36 17 36s17-18 17-36c0-12-3-24-9-32M108 381c0 49 12 69 40 69 23 0 39-14 39-39" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
    </Svg>
  )
}

export function BootAnimation({ onComplete }: { onComplete?: () => void }) {
  const lampOpacity = useRef(new Animated.Value(0.14)).current
  const machineOpacity = useRef(new Animated.Value(0)).current
  const wordmarkOpacity = useRef(new Animated.Value(0)).current
  const subtitleOpacity = useRef(new Animated.Value(0)).current
  const screenOpacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    let completed = false
    const finish = () => {
      if (completed) return
      completed = true
      onComplete?.()
    }
    const reveal = Animated.parallel([
      Animated.sequence([
        Animated.delay(260),
        Animated.timing(lampOpacity, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(820),
        Animated.timing(machineOpacity, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(1240),
        Animated.timing(wordmarkOpacity, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(1510),
        Animated.timing(subtitleOpacity, { toValue: 1, duration: 760, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(2700),
        Animated.timing(screenOpacity, { toValue: 0, duration: 300, easing: Easing.linear, useNativeDriver: true }),
      ]),
    ])

    reveal.start(({ finished }) => {
      if (finished) finish()
    })
    // Browser timer throttling must never strand the app behind its splash.
    const fallback = setTimeout(finish, 3100)
    return () => {
      clearTimeout(fallback)
      reveal.stop()
    }
  }, [lampOpacity, machineOpacity, onComplete, screenOpacity, subtitleOpacity, wordmarkOpacity])

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.container, { opacity: screenOpacity }]}>
      <View style={styles.stage}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: lampOpacity }]}>
          <Lamp />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: machineOpacity }]}>
          <Machine />
        </Animated.View>
      </View>
      <Animated.View style={[styles.wordmarkWrap, { opacity: wordmarkOpacity }]}>
        <Text style={styles.wordmark}>LOSPOR</Text>
      </Animated.View>
      <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity }]}>
        LARGE OPEN SOURCE PERIOPERATIVE REGISTER
      </Animated.Text>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: BACKGROUND,
    justifyContent: "center",
    zIndex: 9999,
  },
  stage: {
    aspectRatio: 360 / 520,
    maxHeight: 520,
    width: "76%",
  },
  wordmarkWrap: {
    marginTop: -18,
  },
  wordmark: {
    color: INK,
    fontFamily: "Roboto_700Bold",
    fontSize: 42,
    letterSpacing: 0,
  },
  subtitle: {
    color: AMBER,
    fontFamily: "Roboto_500Medium",
    fontSize: 10,
    letterSpacing: 0,
    marginTop: 8,
  },
})
