import { Image } from 'react-native';

/**
 * Etiqueta "train-front": la marca de la app (misma que la web). En vez de
 * SVG nativo (que obligaría a reconstruir la APK) se usa un PNG en blanco
 * y se tiñe con `tintColor`, así funciona también por OTA.
 */
export function Logo({ size = 24, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Image
      source={require('../../assets/logo-train.png')}
      style={{ width: size, height: size, tintColor: color }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
