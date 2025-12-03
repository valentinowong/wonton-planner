import "react-native";

declare module "react-native" {
  interface ViewProps {
    dataSet?: Record<string, string>;
  }

  interface PressableProps {
    dataSet?: Record<string, string>;
  }
}
