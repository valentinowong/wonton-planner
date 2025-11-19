import { Slot } from "expo-router";
import { ListsDrawerProvider } from "../../src/contexts/ListsDrawerContext";

export default function DrawerlessLayout() {
  return (
    <ListsDrawerProvider>
      <Slot />
    </ListsDrawerProvider>
  );
}
