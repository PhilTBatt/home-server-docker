# Lenovo ThinkCentre M920q Tiny

Facts are for the **Tiny (1L)** form factor. PSREF entry: "ThinkCentre M920 Tiny" (last modified 2022-03-02 per search title). PSREF has separate entries for **M920x Tiny** (a different model), M920 SFF (see `lenovo-m920s.md`), M920 Tower and M920z AIO [S2]. None of those is covered in this file.

- **Form factor:** Tiny, 1L [S1]
- **CPUs:** 8th/9th-gen Celeron, Pentium and Core i3/i5/i7/i9, all T-suffix. The list matches the M720q list exactly: Celeron G4900T, G4930T; Pentium Gold G5400T, G5420T, G5500T, G5600T; i3-8100T, 8300T, 9100T, 9300T; i5-8400T, 8500T, 8600T, 9400T, 9500T, 9600T; i7-8700T, 9700T; i9-9900T [S1]
  - Socket and TDP: not stated [S1]. Intel lists the i5-8600T as FCLGA1151, 35 W [S3]
- **Chipset:** Intel Q370 [S1]
- **Memory:** "Two DDR4 SO-DIMM slots, dual-channel capable"; "Up to 32GB DDR4-2666" [S1]
  - Footnote: "System automatically clocks down for the processors with lower memory controller" [S1]
  - Celeron, Pentium and i3 run at DDR4-2400. i5, i7 and i9 run at DDR4-2666 [S1]
  - ECC: not stated [S1]
  - Max per stick: not stated [S1]
- **Built-in graphics:** UHD 610 on Celeron and Pentium G5400T/G5420T. UHD 630 on Pentium G5500T/G5600T and all Core CPUs [S1]. No discrete graphics options are listed [S1]
- **Expansion slots:** "One PCIe 3.0 x8, low-profile"; "Two M.2 slots (one for WLAN, one for SSD)" [S1]
  - "2.5" HDD/SSD and PCIe card are mutually exclusive" [S1]
  - Length, power and riser: not stated [S1]
- **Storage:** "Up to two drives, 1x 2.5" HDD/SSD + 1x M.2 SSD". There is one 2.5" bay [S1]
  - M.2 SSD types: 2242 at PCIe 3.0 x2 NVMe, 2280 at PCIe 3.0 x4 NVMe, and Optane M10 [S1]
  - M.2 SATA SSD: none listed (not stated whether supported) [S1]
  - RAID: not supported [S1]
  - SATA port count: not stated
- **Power supply:** external "65W Adapter 88% Autosensing", "90W Adapter 88% Autosensing", "135W Adapter 88% Autosensing", or none [S1]. Connector: not stated
- **Networking:** "Gigabit Ethernet, Intel Ethernet Connection I219-LM, 1x RJ-45, supports Wake-on-LAN"; optional I350-T4 4-port on PCIe x4 [S1]
  - Wi-Fi is optional. Listed cards: Realtek RTL8821CE and RTL8822BE, Intel AC 3165 and AC 8265, and Intel Wireless-AC 9560 (Bluetooth 5.0, "Intel vPro technology support"), or none [S1]
  - M.2 key and size: not stated [S1]
- **Upgrader trip-ups stated in the doc:**
  - The 2.5" drive and a PCIe card are mutually exclusive [S1]
  - Memory clocks down to suit the CPU [S1]
  - vPro over Wi-Fi needs a vPro Wi-Fi card (the 9560) [S1]
  - "Intel vPro with Intel AMT 12.0" is listed [S1]

Sources:
- [S1] PSREF ThinkCentre M920 Tiny spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkCentre/ThinkCentre_M920_Tiny/ThinkCentre_M920_Tiny_Spec.PDF
- [S2] Search results listing PSREF M920x Tiny / M920 SFF / M920 Tower / M920z AIO entries (not opened except M920 SFF): https://psref.lenovo.com/syspool/Sys/PDF/ThinkCentre/ThinkCentre_M920x_Tiny/ThinkCentre_M920x_Tiny_Spec.PDF
- [S3] Intel Core i5-8600T specifications: https://www.intel.com/content/www/us/en/products/sku/129938/intel-core-i58600t-processor-9m-cache-up-to-3-70-ghz/specifications.html

Second check, 2026-11-20: 20 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
