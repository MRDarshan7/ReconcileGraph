export const DOC_DISPLAY_NAMES: Record<string, string> = {
  "doc1_bom_revB.md": "Plant Line-4 BOM (Rev B)",
  "doc2_pump_spec_revA.md": "Pump P-101 Datasheet (Rev A)",
  "doc3_pump_spec_revB.md": "Pump P-101 Datasheet (Rev B)",
  "doc4_maint_log.md": "Maintenance Log (MNT-2026-09)",
  "doc5_valve_sop_insp.md": "Compliance Record (COMP-L4)",
};

export function formatDocLabel(textOrId: string): string {
  if (DOC_DISPLAY_NAMES[textOrId]) {
    return DOC_DISPLAY_NAMES[textOrId];
  }
  let formatted = textOrId;
  for (const [fileName, title] of Object.entries(DOC_DISPLAY_NAMES)) {
    if (formatted.includes(fileName)) {
      formatted = formatted.replaceAll(fileName, title);
    }
  }
  return formatted;
}
