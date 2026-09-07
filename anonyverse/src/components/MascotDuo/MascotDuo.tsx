import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const mili = require('../../assets/images/mili.png');
const milo = require('../../assets/images/milo.png');

/**
 * Mili + Milo mascot pairing, matching node 10:782 / 10:783 in the Entry
 * Figma frame (identical illustration reused in the Returning User frame).
 */
export function MascotDuo() {
  return (
    <View style={styles.container}>
      <Image source={mili} style={styles.mili} resizeMode="contain" />
      <Image source={milo} style={styles.milo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 177,
    width: '100%',
  },
  mili: {
    position: 'absolute',
    left: 8,
    top: 9,
    width: 176,
    height: 168,
  },
  milo: {
    position: 'absolute',
    left: 168,
    top: 0,
    width: 166,
    height: 160,
  },
});
