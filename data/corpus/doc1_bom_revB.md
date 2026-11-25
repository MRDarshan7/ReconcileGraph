# Plant Line-4 Bill of Materials (BOM)

- **Document ID:** BOM-L4-001
- **Document Type:** Bill of Materials (`bom`)
- **Facility / Line:** Plant Line-4 Feed Header
- **Revision:** B
- **Status:** RELEASED
- **Effective Date:** 2026-08-15
- **Supersedes:** Revision A

## Equipment & Component Schedule

| Item | Tag | Component Name | Model / Spec | Key Operating Parameters | Connections & Governance |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `P-101` | Main Feed Pump | Centriflo-400, Flange ANSI 150# | Rated Discharge Pressure: 10.0 bar | Governing SOP: `SOP-7` |
| 2 | `V-12` | Isolation Check Valve | Velan-CV2 | Max Allowable Working Pressure (MAWP): 12.0 bar | Connected downstream of `P-101` |
| 3 | `PRV-04` | Pressure Relief Valve | Spring-Loaded Safety Relief | Set Pressure: 11.5 bar | Protects Line-4 header (downstream of `P-101`) |

## Engineering Notes

1. All Line-4 rotating and pressure-retaining equipment listed above reflects the Revision B throughput configuration released in August 2026.
2. Any modification to `P-101` discharge conditions must be cross-checked against `V-12` MAWP, `PRV-04` set pressure, and `SOP-7` interlock limits.
