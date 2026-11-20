# Lenovo ThinkStation P330 Tiny

Facts are for the **P330 Tiny (1L)** (last modified 2021-08-16 per search title).

- **Form factor:** "Tiny (1L)" [S1]
- **CPUs:** "Up to one Intel Core i9, i7, i5, or i3 processor"; socket "1x FCLGA1151" [S1]. Both T and non-T CPUs are listed:
  - Core i3-8100, 8100T, 8300, 8300T, 9100, 9100T, 9300, 9300T, 9320
  - Core i5-8400, 8400T, 8500, 8500T, 8600, 8600T, 9400, 9400T, 9500, 9500T, 9600, 9600T
  - Core i7-8700, 8700T, 9700, 9700T
  - Core i9-9900, 9900T
  - Per-CPU TDP: not stated [S1]
- **Chipset:** "Intel Q370 chipset" [S1]
- **Memory:** "Two DDR4 SO-DIMM slots, dual-channel capable"; "Up to 64GB"; "DDR4-2666 non-ECC" [S1]
  - i3 rows list DDR4-2400 [S1]
  - Max per stick: not stated
- **Built-in graphics:** UHD 630 on every listed CPU [S1]
- **Expansion slots:** "One PCIe 3.0 x16 or x4 slot, low-profile, via riser card" [S1]. The riser options are:
  - "PCIe 3.0 x16 (negotiable link width x8) and low profile for discrete graphics card"
  - "PCIe 3.0 x4 and low profile for i350-T4 adapter and quad COM ports adapter"
- **Graphics cards:** "Supports one optional discrete graphics card on 35W processor models" [S1]
  - Listed: Quadro P620 (2GB, 40W, 4x miniDP) and Quadro P1000 (4GB, 50W, 4x miniDP) [S1]
  - Which CPUs count as "35W" isn't marked in the table [S1]. Intel lists the i5-8600T, a T-suffix part, at 35 W [S2]. That the T-suffix CPUs are the "35W processor models" Lenovo means is an inference, not stated by Lenovo
  - Max card length and power cable: not stated
- **Storage:** "Up to 1x 2.5" HDD + 2x M.2 SSD"; "Uo to 2x M.2 SSD via onboard slots" (typo on the sheet) [S1]
  - M.2 type: "M.2 PCIe SSD PCIe NVMe" up to 1TB each. Length: not stated [S1]
  - "1x 2.5" disk bay", footnoted "2.5" disk bay is available on models without discrete graphics card" [S1]
  - Optional 9.0 mm optical drive via kit [S1]
  - RAID: not stated
- **Power supply:** "135W Adapter 88% Autosensing" (external) [S1]
- **Networking:** Intel I219-LM GbE with Wake-on-LAN. Optional I350-T4 (PCIe x4) [S1]
  - Wi-Fi is optional: Intel AC 8265 (BT 4.2) or Intel AC 9560 (BT 5.1), M.2 card, or none [S1]
  - Slot key: not stated
- **Upgrader trip-ups stated in the doc:**
  - A discrete GPU only on 35W-CPU models [S1]
  - A GPU and the 2.5" drive can't both be fitted [S1]
  - The PCIe slot needs the specific riser [S1]
  - Non-ECC memory only [S1]
  - vPro/AMT 12 needs a "vPro-enable processor and WiFi" [S1]

Sources:
- [S1] PSREF ThinkStation P330 Tiny spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkStation/ThinkStation_P330_Tiny/ThinkStation_P330_Tiny_Spec.PDF
- [S2] Intel Core i5-8600T specifications: https://www.intel.com/content/www/us/en/products/sku/129938/intel-core-i58600t-processor-9m-cache-up-to-3-70-ghz/specifications.html

Second check, 2026-11-20: 11 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
