# Lenovo ThinkCentre M920s SFF

Facts are for the **SFF (8.4L)**. PSREF entry: "ThinkCentre M920 SFF" (last modified 2022-05-11 per search title). The string "M920s" does not appear on the sheet [S1].

- **Form factor:** "SFF (8.4L)", "92.5 x 290.5 x 343.5 mm (3.6 x 11.4 x 13.5 inches)" [S1]
- **CPUs:** 8th/9th-gen non-T desktop CPUs [S1]:
  - Celeron G4900, G4920, G4930, G4950
  - Pentium Gold G5400, G5420, G5500, G5600, G5620
  - Core i3-8100, 8300, 9100, 9300, 9320
  - Core i5-8400, 8500, 8600, 9400, **9400F**, 9500, **9500F**, 9600
  - Core i7-8700, 9700
  - Core i9-9900
  - Socket and TDP: not stated [S1]. Intel lists the i3-8100 as FCLGA1151, 65 W [S2]
- **Chipset:** "Intel Q370 chipset" [S1]
- **Memory:** "Four DDR4 DIMM slots, dual-channel capable"; "Up to 64GB DDR4-2666" [S1]
  - Footnote: max memory "based on the test results with current Lenovo memory offerings" [S1]
  - Speed by CPU: DDR4-2400 for Celeron, Pentium and i3. DDR4-2666 for i5, i7 and i9 [S1]
  - UDIMM/RDIMM wording: not stated beyond "DDR4 DIMM" [S1]
  - ECC: not stated [S1]
  - Max per stick: not stated
- **Built-in graphics:** UHD 610 on the Celerons and Pentium G5400/G5420. UHD 630 on Pentium G5500/G5600/G5620 and the Core CPUs. **i5-9400F and i5-9500F have no processor graphics** ("-" in the table) [S1]
  - Integrated outputs: "1x VGA, 2xDP" [S1]
- **Expansion slots** (spelling as on the sheet) [S1]:
  - "One PCIe 3.0 x1, low-profie (length < 150mm, height < 68mm)"
  - "One PCIe 3.0 x16 (x4 signal), low-profie (length < 150mm, height < 68mm)"
  - "One PCIe 3.0 x16, low-profie (length < 150mm, height < 68mm)"
  - "One dummy slot, only bracket for optional port extension"
- **Graphics card limits:** cards must be low profile, under 150 mm long and under 68 mm high (from the slot lines) [S1]
  - Factory discrete options: "AMD Radeon 520 Discrete 2GB GDDR5 2x DP 1.2" (no power figure given), and "NVIDIA GeForce GT 730 Discrete 2GB GDDR5 2x DP ... PCIe 2.0x16, 35 watts" [S1]
  - Max card power and PCIe power cable: not stated [S1]
- **Storage:** "Up to three drives, 1x 2.5"/3.5" HDD/SSD + 1x 2.5" HDD/SSD + 1x M.2 SSD" [S1]
  - Bays: "1x 2.5" disk bay (optional, or bay comes with disk)", "1x 3.5" disk bay", "1x slim ODD bay" [S1]
  - M.2: one SSD slot (plus one WLAN slot). SSD types are M.2 2242 at PCIe 3.0 x2 NVMe, M.2 2280 at PCIe 3.0 x4 NVMe, and Optane M10 [S1]
  - M.2 SATA: none listed [S1]
  - Optical: slim 9.0 mm DVD-ROM or DVD burner, "SATA 1.5Gb/s" [S1]
  - RAID: "RAID 0/1 support for HDDs (RAID preset only available via special bid model)" [S1]
  - SATA port count: not stated [S1]
- **Power supply:** fixed PSU (the sheet says "Fixed"; that it is internal is an inference, not stated): 180W (85%), 210W (85%), or 260W (92%, 100-240V) [S1]. Connector type and proprietary status: not stated. No PSU/graphics pairing note [S1]
- **Networking:** "Gigabit Ethernet, Intel Ethernet Connection I219-LM, 1x RJ-45, supports Wake-on-LAN" [S1]
  - Optional NICs: Bitland BN8E88 (PCIe x1) and Intel I350-T4 (PCIe x4) [S1]
  - Wi-Fi is optional. Cards: Realtek RTL8821CE/RTL8822BE, Intel AC 3165/8265 and Intel AC 9560 (vPro), as M.2 cards [S1]
  - M.2 key and size: not stated
- **Upgrader trip-ups stated in the doc:**
  - The F-model CPUs have no graphics output [S1]
  - Slot card size limit is < 150 mm long and < 68 mm high [S1]
  - Wireless vPro needs a vPro Wi-Fi card [S1]
  - BIOS requirement for 9th-gen: not stated

Sources:
- [S1] PSREF ThinkCentre M920 SFF spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkCentre/ThinkCentre_M920_SFF/ThinkCentre_M920_SFF_Spec.PDF
- [S2] Intel Core i3-8100 specifications: https://www.intel.com/content/www/us/en/products/sku/126688/intel-core-i38100-processor-6m-cache-3-60-ghz/specifications.html

Second check, 2026-11-20: 21 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
