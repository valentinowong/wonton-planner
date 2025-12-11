import { Pressable, Text, View } from "react-native";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { PlannerIconButton } from "./PlannerIconButton";
import { usePlannerStyles } from "../state/PlannerStylesContext";

type PlannerHeroProps = {
  viewMode: "calendar" | "tasks";
  onChangeViewMode: (mode: "calendar" | "tasks") => void;
  rangeLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onOpenSettings: () => void;
  onOpenNotifications: () => void;
  onOpenFilters: () => void;
  unreadCount?: number;
};

export function PlannerHero({
  viewMode,
  onChangeViewMode,
  rangeLabel,
  onPrev,
  onNext,
  onToday,
  onOpenSettings,
  onOpenNotifications,
  onOpenFilters,
  unreadCount,
}: PlannerHeroProps) {
  const styles = usePlannerStyles();
  return (
    <View style={styles.heroBar}>
      <View style={styles.heroLeft}>
        <Text style={styles.heroEyebrow}>Planner</Text>
        <Text style={styles.heroRange}>{rangeLabel}</Text>
      </View>
      <View style={styles.heroControls}>
        <View style={styles.navGroup}>
          <PlannerIconButton icon="chevron-back" onPress={onPrev} />
          <Pressable style={styles.todayButton} onPress={onToday}>
            <Text style={styles.todayButtonText}>Today</Text>
          </Pressable>
          <PlannerIconButton icon="chevron-forward" onPress={onNext} />
        </View>
        <SegmentedControl
          size="sm"
          options={[
            { label: "Calendar", value: "calendar" },
            { label: "Tasks", value: "tasks" },
          ]}
          value={viewMode}
          onChange={(next) => onChangeViewMode(next as "calendar" | "tasks")}
        />
        <View style={styles.heroActions}>
          <PlannerIconButton icon="funnel-outline" onPress={onOpenFilters} />
          <View style={styles.notificationButton}>
            <PlannerIconButton icon="notifications-outline" onPress={onOpenNotifications} />
            {unreadCount && unreadCount > 0 ? (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{unreadCount > 9 ? "9+" : unreadCount}</Text>
              </View>
            ) : null}
          </View>
          <PlannerIconButton icon="person-circle" onPress={onOpenSettings} />
        </View>
      </View>
    </View>
  );
}
