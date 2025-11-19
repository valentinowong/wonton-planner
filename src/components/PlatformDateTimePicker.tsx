import { Platform, StyleSheet } from "react-native";
import type DateTimePickerType from "@react-native-community/datetimepicker";
import type { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { DatePickerModal, TimePickerModal } from "react-native-paper-dates";
import { en, registerTranslation } from "react-native-paper-dates";

type PickerMode = "date" | "time";

type Props = {
  value: Date;
  mode: PickerMode;
  onChange: (date: Date) => void;
  onCancel?: () => void;
  minimumDate?: Date;
  maximumDate?: Date;
};

const isWeb = Platform.OS === "web";
const registeredLocales = new Set<string>();
function ensureLocale(locale: string) {
  if (registeredLocales.has(locale)) return;
  registerTranslation(locale, en);
  registeredLocales.add(locale);
}
ensureLocale("en");
const NativeDateTimePicker = !isWeb ? (require("@react-native-community/datetimepicker").default as typeof DateTimePickerType) : null;

export function PlatformDateTimePicker({ value, mode, onChange, onCancel, minimumDate, maximumDate }: Props) {
  if (isWeb) {
    const resolved = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().locale ?? "en" : "en";
    const locale = resolved.split("-")[0] || "en";
    ensureLocale(locale);
    if (mode === "date") {
      return (
        <DatePickerModal
          mode="single"
          visible
          locale={locale}
          date={value}
          onDismiss={() => onCancel?.()}
          onConfirm={({ date }) => {
            if (date) {
              onChange(date);
            }
            onCancel?.();
          }}
        />
      );
    }
    return (
      <TimePickerModal
        visible
        locale={locale}
        hours={value.getHours()}
        minutes={value.getMinutes()}
        onDismiss={() => onCancel?.()}
        onConfirm={({ hours, minutes }) => {
          const next = new Date(value);
          next.setHours(hours, minutes, 0, 0);
          onChange(next);
          onCancel?.();
        }}
      />
    );
  }

  function handleNativeChange(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === "android") {
      if (event.type === "dismissed") {
        onCancel?.();
        return;
      }
      if (event.type === "set" && next) {
        onChange(next);
      }
      onCancel?.();
      return;
    }
    if (next) {
      onChange(next);
    }
  }

  return NativeDateTimePicker ? (
    <NativeDateTimePicker
      value={value}
      mode={mode}
      display={Platform.OS === "ios" ? "spinner" : "default"}
      onChange={handleNativeChange}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      style={styles.nativePicker}
    />
  ) : null;
}

const styles = StyleSheet.create({
  nativePicker: {
    alignSelf: "stretch",
  },
});
