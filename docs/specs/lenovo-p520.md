# Lenovo ThinkStation P520

Facts are for the **P520 tower (33L)**. Not to be confused with the **P520c**, a separate, smaller model; see the note at the end of this file.

- **Form factor:** Tower 33L, 165 x 455 x 446 mm [S1]
- **CPUs:** "Up to one Intel Xeon W-2100 / W-2200 Processor"; socket 1x FCLGA2066 [S1]
  - W-2100: W-2102, 2104, 2123, 2125, 2133, 2135, 2145, 2155, 2175, 2195
  - W-2200: W-2223, 2225, 2235, 2245, 2255, 2265, 2275, 2295
  - TDP: not stated [S1]
  - BIOS requirement for W-2200: not stated [S1]
- **Chipset:** Intel C422 [S1]
- **Memory:** "8 DDR4 DIMM slots, 4 channels capable"; "DDR4-2666 RDIMM ECC" and "DDR4-2933 RDIMM ECC"; "Up to 512GB (8x 64GB RDIMM)"; memory protection "ECC" [S1]
  - Per-CPU speed from the table: W-2102/2104 DDR4-2400; other W-21xx DDR4-2666; W-2223 DDR4-2666; other W-22xx DDR4-2933 [S1]
  - UDIMM and LRDIMM: not mentioned [S1]
  - **Sources disagree on max:**
    - An older Lenovo datasheet (© 2018) says max 256GB, with DIMM sizes 8/16/32GB [S2]
    - Current PSREF says 512GB (8x 64GB) [S1]
    - The thinkstation-specs.com sheet (v5, 03/08/2022) says "Max DIMM Size 64GB DDR4 ECC RDIMM" and "Max System Memory 512GB" [S3]
    - **Settled on a second check, 2026-11-20: use 512GB (8x 64GB RDIMM).** Settled by the current PSREF [S1], which footnotes that max memory "is based on the test results with current Lenovo memory offerings". The 2018 datasheet lists only 8/16/32GB RDIMMs [S2], and 8 x 32GB = 256GB (checker's arithmetic), so its lower figure reflects the DIMMs offered in 2018. The 2022 thinkstation-specs.com sheet agrees with 512GB / 64GB per DIMM [S3]
- **Built-in graphics:** not stated in the docs read. (from memory, unchecked) Xeon W-2100/W-2200 have no integrated graphics, so a graphics card is needed for display
- **Expansion slots:** "Supports 5x PCIe 3.0 slots plus 1x PCI slot" [S1]:
  - "Slot 1: PCIe 3.0 x8, full height, full length, 25W, double-width, by CPU"
  - "Slot 2: PCIe 3.0 x16, full height, full length, 75W, by CPU"
  - "Slot 3: PCIe 3.0 x4, full height, full length, 25W, double-width, by PCH"
  - "Slot 4: PCIe 3.0 x16, full height, full length, 75W, by CPU"
  - "Slot 5: PCI, full height, full length, 25W"
  - "Slot 6: PCIe 3.0 x4, full height, half length, 25W, by PCH"
  - **Sources conflict on Slot 1 power:** PSREF says 25W [S1]; the thinkstation-specs.com sheet says "Slot 1 PCIe 3.0 x8, Full Height, Full Length, 50W, Open Ended" [S3]. That sheet also gives no wattage for Slot 5 [S3]
- **Graphics cards:** "Supports up to one NVIDIA Quadro RTX 8000" [S1]. Footnote: "Discrete graphics support may vary by configurations such as processor selection or power supply wattage." [S1]
  - The PSREF list runs from Quadro P400 (30W) to RTX 6000/8000 (295W, dual-slot) and the RTX A-series (A2000 70W to A5000/A5500 230W) [S1]
  - Other cards the PSREF lists that the line above doesn't name: NVIDIA T400 (40W), T600 (40W), T1000 (50W), Quadro P600 (45W), GP100 (235W), GV100 (250W), RTX A4000 (140W, single slot) and RTX A4500 (200W) [S1]
  - The 2018 datasheet says "Up to 1x NVIDIA Quadro GV100" [S2]
  - Aux power connectors: not stated by PSREF. The thinkstation-specs.com sheet lists "Graphics 2 x 8 pin (6+2)" [S3]
- **Storage:**
  - "Up to 6x 3.5" SATA HDD / 2.5" SATA HDD / 2.5" SATA SSD + 9x M.2 PCIe SSD + 1x PCIe AIC SSD" [S1]
  - Bays: 2x 3.5" standard; up to 4x 3.5" with options (third-disk/Storage Bay Upgrade Kit, flex bay); 2x flex bays; up to two half-height or 9.0 mm optical [S1]
  - M.2: "2 via onboard slots", plus 4 via a Quad M.2-to-PCIe adapter and 3 via Single M.2-to-PCIe adapters, all PCIe NVMe [S1]
  - M.2 length: not stated [S1][S3]
  - SATA port count: not stated in PSREF. thinkstation-specs.com says "6 x SATA Connectors, Gen 3" plus "1 x eSATA Connector" [S3]
  - RAID: onboard RSTe SATA 0/1/10/5. Optional RAID cards and NVMe RAID are also listed [S1]
- **Power supply:** 690W, 900W or 1000W fixed, 92%, 80 PLUS Platinum [S1]. The 2018 datasheet lists 690W and 900W only [S2]
- **Networking:** onboard Intel I219-LM GbE with Wake-on-LAN. Optional add-in NICs up to 10GbE [S1]
  - Wi-Fi is optional: Intel AC 8265 or Intel Wi-Fi 6E AX210, or none [S1]
  - Slot type: not stated
- **Upgrader trip-ups stated in the doc:**
  - RDIMM ECC only [S1]
  - Memory speed follows the CPU (2400/2666/2933) [S1]
  - Graphics support depends on CPU and PSU wattage [S1]
- **P520c (different model, for disambiguation):** "Tower (25L)"; FCLGA2066, C422, Xeon W-2100/W-2200 [S4]
  - "4 DDR4 DIMM slots"; "Up to 256GB (4x 64GB RDIMM)" [S4]
  - Four slots: two x16, one x8, one x4 [S4]
  - "Supports up to one NVIDIA RTX A5000" [S4]
  - PSU: 500W or 625W [S4]
  - A P520c is not a P520, and parts limits differ

Sources:
- [S1] PSREF ThinkStation P520 spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkStation/ThinkStation_P520/ThinkStation_P520_Spec.PDF
- [S2] Lenovo ThinkStation P520 datasheet (© 2018): https://static.lenovo.com/shop/emea/content/pdf/ThinkStation/P520/ThinkStation%20P520%20Datasheet.pdf
- [S3] thinkstation-specs.com P520 sheet (Version 5, 03/08/2022; site uses Lenovo branding but I couldn't confirm it is Lenovo's): https://thinkstation-specs.com/wp-content/uploads/2019/09/P520-Lenovo-ThinkStation.pdf
- [S4] PSREF ThinkStation P520c spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkStation/ThinkStation_P520c/ThinkStation_P520c_Spec.PDF

Second check, 2026-11-20: 21 facts checked against the cited pages; 0 corrected; 1 couldn't be checked.
