import React, { useRef } from 'react';
import {
  type AccessibilityActionEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, fontFamily } from '../../design/tokens';

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 3;
const EDGE_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

export interface WheelOption {
  label: string;
  value: number | null;
}

export interface WheelPickerProps {
  label: string;
  options: WheelOption[];
  value: number | null;
  onChange: (value: number | null) => void;
}

export function WheelPicker({ label, options, value, onChange }: WheelPickerProps) {
  const scrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const selectedIndex = Math.max(
    options.findIndex(option => option.value === value),
    0,
  );
  const clampIndex = (index: number) => Math.min(Math.max(index, 0), options.length - 1);

  const scrollToIndex = (index: number) => {
    scrollRef.current?.scrollTo({ y: clampIndex(index) * ITEM_HEIGHT, animated: true });
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = options[clampIndex(Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT))].value;
    if (next !== value) {
      onChange(next);
    }
  };

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    scrollToIndex(selectedIndex + (event.nativeEvent.actionName === 'increment' ? 1 : -1));
  };

  return (
    <View style={styles.column}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.wheel}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: value === null ? 'Not selected' : options[selectedIndex].label }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={handleAccessibilityAction}
      >
        <View style={styles.highlight} pointerEvents="none" />
        <ScrollView
          ref={scrollRef}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={ITEM_HEIGHT}
          decelerationRate="fast"
          scrollEventThrottle={16}
          onScroll={handleScroll}
          contentContainerStyle={styles.content}
        >
          {options.map((option, index) => (
            <Pressable key={option.label} style={styles.item} onPress={() => scrollToIndex(index)}>
              <Text
                numberOfLines={1}
                style={[styles.itemText, index === selectedIndex ? styles.itemTextSelected : styles.itemTextFaded]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    flex: 1,
  },
  label: {
    marginBottom: 6,
    textAlign: 'center',
    fontFamily: fontFamily.semiBold,
    fontSize: 12,
    color: colors.inkMuted,
  },
  wheel: {
    height: ITEM_HEIGHT * VISIBLE_ROWS,
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    top: EDGE_PADDING,
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    borderRadius: 12,
    backgroundColor: colors.infoBadgeBackground,
  },
  content: {
    paddingVertical: EDGE_PADDING,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontFamily: fontFamily.bold,
    fontSize: 17,
  },
  itemTextSelected: {
    color: colors.ink,
  },
  itemTextFaded: {
    color: colors.inkMuted,
    opacity: 0.6,
  },
});
