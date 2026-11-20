# Lenovo ThinkStation P330 Tower Gen 2

Facts are for the **P330 Tower Gen 2**.

- **Form factor:** "Tower (18L)", 165 x 328 x 376 mm [S1]
- **CPUs:** "Up to one Intel Xeon, Core i9, i7, i5, or i3 processor"; socket "1x FCLGA1151" [S1]. No Pentium appears in the list [S1]:
  - Core i3-8100, 8300, 9100, 9300
  - Core i5-8500, 9400, **9400F**, 9500, 9600, 9600K
  - Core i7-8700, 8700K, 9700, 9700K
  - Core i9-9900, 9900K
  - Xeon E-2174G, E-2186G, **E-2224**, E-2224G, E-2226G, **E-2234**, **E-2236**, E-2244G, E-2246G, E-2274G, E-2276G, E-2278G, E-2286G
  - TDP: not stated [S1]
- **Chipset:** Intel C246 [S1]
- **Memory:** "4 DIMM sockets with 2 channels"; "Up to 64GB"; "DDR4-2666 UDIMM ECC" or "DDR4-2666 UDIMM non-ECC" [S1]
  - "ECC on models with ECC DIMMs and Xeon processor" [S1]
  - Core i3 rows list DDR4-2400. All others list DDR4-2666 [S1]
- **Built-in graphics:** none on **i5-9400F, Xeon E-2224, E-2234, E-2236**. UHD 630 on the other Core CPUs, P630 on the -G Xeons [S1]
  - "DP needs Core, Pentium, or -G suffix Xeon processor" [S1]
- **Expansion slots:** same three as Gen 1 [S1]:
  - Slot 1: PCIe 3.0 x16, full height, half length (CPU)
  - Slot 2: PCIe 3.0 x1, full height, full length (PCH)
  - Slot 3: PCIe 3.0 x16 (x4 link), full height, half length (PCH)
- **Graphics cards:** "Supports up to one NVIDIA Quadro RTX 4000, or two NVIDIA Quadro P2200, 400W PSU is needed" [S1]
  - Listed cards: P400 30W, P620 40W, P1000 50W, P2000 75W, P2200 75W, P4000 120W, P5000 180W, RTX 4000 160W [S1]
  - The table has a "Power Connector" column, but it returned no values. Aux connector count: not stated
- **Storage:** "Up to 3x 3.5" SATA HDD / 4x 2.5" SATA HDD / SSD + 3x M.2 PCIe SSD" [S1]
  - Bays: "1x 3.5" disk bay (standard)"; "1x 2.5" disk bay (optional...)"; "2x 3.5" disk bay (optional)": 1 with a disk or Storage Bay Upgrade Kit, 1 via the Flex bay [S1]
  - M.2: 1 onboard plus 2 via "Single M.2 to PCIe adapter" [S1]
  - The SSD row reads "M.2 PCIe SSD PCIe 4.0 NVMe" [S1]. The platform's slots are all PCIe 3.0, so expect PCIe 3.0 speed (inference)
  - RAID: SATA 0/1/10/5, PCIe 0/1 [S1]
  - SATA port count: not stated
- **Power supply:** 250W or 400W fixed, 92%, 80 PLUS Platinum [S1]
- **Networking:** Intel I219-LM GbE with Wake-on-LAN [S1]
  - Wi-Fi is optional: Intel AC 9560 (BT 5.1) "M.2 card" [S1]
  - Slot key: not stated

Sources:
- [S1] PSREF ThinkStation P330 Tower Gen 2 spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkStation/ThinkStation_P330_Tower_Gen_2/ThinkStation_P330_Tower_Gen_2_Spec.PDF

Second check, 2026-11-20: 16 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
