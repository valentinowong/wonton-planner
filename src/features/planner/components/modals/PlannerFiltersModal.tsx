import { Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePlannerStyles } from "../../state/PlannerStylesContext";
import { useTheme } from "../../../../theme/ThemeContext";
import type { PlannerFiltersState, AssigneeFilterValue } from "../../types/filters";

export type PlannerFiltersModalProps = {
  visible: boolean;
  value: PlannerFiltersState;
  onChange: (next: PlannerFiltersState) => void;
  onClose: () => void;
  assigneeOptions: { label: string; value: AssigneeFilterValue }[];
};

type FilterOption<T extends string> = { label: string; value: T; subtitle?: string };

export function PlannerFiltersModal({ visible, value, onChange, onClose, assigneeOptions }: PlannerFiltersModalProps) {
  const styles = usePlannerStyles();
  const { colors } = useTheme();

  function handleSelect<K extends keyof PlannerFiltersState>(key: K, option: PlannerFiltersState[K]) {
    onChange({ ...value, [key]: option });
  }

  const statusOptions: FilterOption<PlannerFiltersState["status"]>[] = [
    { label: "Any status", value: "all" },
    { label: "Todo", value: "todo" },
    { label: "Completed", value: "done" },
  ];

  const plannedOptions: FilterOption<PlannerFiltersState["planned"]>[] = [
    { label: "Any schedule", value: "all" },
    { label: "Scheduled Date Only", value: "unscheduled", subtitle: "No time block" },
    { label: "Scheduled Date & Time", value: "scheduled", subtitle: "Has planned start/end" },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(event) => event.stopPropagation()}>
          <View style={styles.modalHeaderRow}>
            <View>
              <Text style={styles.modalTitle}>Filters</Text>
              <Text style={styles.modalSubtitle}>Adjust which tasks show in your planner.</Text>
            </View>
            <Pressable style={styles.iconButton} onPress={onClose}>
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Assignee</Text>
            <View style={styles.filterPillRow}>
              {assigneeOptions.map((option) => {
                const active = value.assignee === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => handleSelect("assignee", option.value)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Status</Text>
            <View style={styles.filterPillRow}>
              {statusOptions.map((option) => {
                const active = value.status === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => handleSelect("status", option.value)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.modalSection}>
            <Text style={styles.modalSectionTitle}>Schedule</Text>
            <View style={styles.filterPillRow}>
              {plannedOptions.map((option) => {
                const active = value.planned === option.value;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.filterPill, active && styles.filterPillActive]}
                    onPress={() => handleSelect("planned", option.value)}
                  >
                    <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>{option.label}</Text>
                    {option.subtitle ? <Text style={styles.filterPillMeta}>{option.subtitle}</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
