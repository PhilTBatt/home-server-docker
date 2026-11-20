# Lenovo ThinkCentre M90q Gen 2 Tiny

Facts are for the **Tiny (1L)**. PSREF entry: "ThinkCentre M90q Gen 2" (last modified 2022-12-08 per search title). The M90q (Gen 1) and later generations (Gen 4, 5, 6) are separate PSREF entries and are not covered [S3].

- **Form factor:** "Tiny (1L)" [S1]
- **CPUs:** "Intel Celeron, Intel Pentium, 10th Generation Intel Core i3, or 11th Generation Intel Core i5 / i7 / i9 Processor" [S1]. The list mixes T-suffix and non-T CPUs [S2]:
  - Celeron G5905T, G5925
  - Pentium Gold G6505T, G6605
  - Core i3-10105, 10105T, 10305, 10305T, 10325
  - Core i5-11400, 11400T, 11500, 11500T, 11600, 11600T
  - Core i7-11700, 11700T
  - Core i9-11900, 11900T
  - Socket and TDP: not stated [S2]
  - Intel lists the i5-11600T as FCLGA1200, 35 W, PCIe 4.0 [S4]
  - Intel lists the i3-10105T as FCLGA1200, 35 W, PCIe 3.0 [S5]
- **Chipset:** Intel Q570 [S1]
- **Memory:** "Two DDR4 SO-DIMM slots, dual-channel capable"; "Up to 64GB" (DDR4-2666 / 2933 / 3200) [S2]
  - Footnote: "Installed memory is actually 3200MHz, but may run at 2666MHz, 2933 MHz or 3200MHz depending on the memory support capability of processor." [S2]
  - Table speeds: DDR4-2666 for Celeron, Pentium and i3-10xxx. DDR4-3200 for 11th-gen i5, i7 and i9 [S2]
  - ECC: not stated [S2]. Intel lists ECC "No" for the i5-11600T and i3-10105T [S4][S5]
  - Max per stick: not stated
- **Built-in graphics:** UHD 610 (Celerons), UHD 630 (Pentiums, i3s), UHD 730 (i5-11400/11400T), UHD 750 (all other i5, i7 and i9) [S2]. Every listed CPU has graphics. No discrete graphics options are listed [S1]
- **Expansion slots:** "Three M.2 slots (one for WLAN, two for SSD)". **No PCIe slot is listed** under expansion slots [S2]
  - However, PSREF also lists an optional "Intel Ethernet Server Adapter I350-T4, 4x RJ-45, PCIe x4", footnoted "not available in EMEA". How it attaches is not stated [S2]
- **Storage:** "Up to three drives, 1x 2.5" HDD + 2x M.2 SSD"; "1x 2.5" disk bay" [S2]
  - M.2 SSD types: "M.2 2242 SSD | PCIe NVMe, PCIe 3.0 x2" (128GB); "M.2 2280 SSD | PCIe NVMe" (256GB-2TB, Opal); "M.2 2280 SSD | PCIe NVMe, PCIe 4.0 x4 Performance" (512GB-2TB, Opal 2.0) [S2]
  - Not stated: which M.2 slot is PCIe 4.0, or whether PCIe 4.0 needs an 11th-gen CPU [S2]. Intel lists the 10th-gen i3-10105T as PCIe 3.0 only and the 11th-gen i5-11600T as PCIe 4.0 [S4][S5], so PCIe 4.0 SSD speed with an i3 is doubtful (inference, not stated by Lenovo)
  - M.2 SATA: none listed [S2]
  - RAID: "No support" [S2]
  - SATA port count: not stated
- **Power supply:** external adapters, 65W, 90W, 135W or 230W (each 89%, autosensing), or none. No note pairs an adapter with a CPU [S2]. "(Optional) Power adapter cage" [S2]. Connector: not stated
- **Networking:** onboard Intel I219-LM GbE with Wake-on-LAN [S1]
  - Wi-Fi is optional: Realtek RTL8822CE (Wi-Fi 5, BT 5.0), Intel Wireless-AC 9560 (BT 5.1), Intel Wi-Fi 6 AX201 (BT 5.1), or none [S1]
  - M.2 key and size: not stated
- **Upgrader trip-ups stated in the doc:**
  - Memory speed follows the CPU (2666 vs 3200) [S2]
  - Some features may be unsupported with a Linux preload (e.g. Intel RST RAID) [S1]
  - Adapter wattage per CPU: not stated

Sources:
- [S1] PSREF ThinkCentre M90q Gen 2 spec (HTML): https://psref.lenovo.com/syspool/Sys/PDF/ThinkCentre/ThinkCentre_M90q_Gen_2/ThinkCentre_M90q_Gen_2_Spec.html
- [S2] PSREF ThinkCentre M90q Gen 2 spec (PDF): https://psref.lenovo.com/syspool/Sys/PDF/ThinkCentre/ThinkCentre_M90q_Gen_2/ThinkCentre_M90q_Gen_2_Spec.PDF
- [S3] Search results showing separate PSREF entries for M90q, M90q Gen 4/5/6 (not opened): https://psref.lenovo.com/syspool/Sys/PDF/ThinkCentre/ThinkCentre_M90q/ThinkCentre_M90q_Spec.html
- [S4] Intel Core i5-11600T specifications: https://www.intel.com/content/www/us/en/products/sku/212278/intel-core-i511600t-processor-12m-cache-up-to-4-10-ghz/specifications.html
- [S5] Intel Core i3-10105T specifications: https://www.intel.com/content/www/us/en/products/sku/201890/intel-core-i310105t-processor-6m-cache-up-to-3-90-ghz/specifications.html

Second check, 2026-11-20: 22 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
