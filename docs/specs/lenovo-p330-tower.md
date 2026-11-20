# Lenovo ThinkStation P330 Tower (Gen 1)

Facts are for the **P330 Tower, first generation**.

- **Form factor:** 18L tower, 376 H x 165 W x 328 D mm [S1]
- **CPUs:** one CPU only [S1]:
  - "Up to one Intel Xeon E family processor, up to 95W, up to 6 cores at 3.8GHz"
  - "Or up to one 8th Intel Core family processor, i7, i5, or i3, up to 95W, up to 6 cores"
  - "Or up to one Intel Pentium Gold G5400 via Special Bids, 54W, 2 cores at 3.7GHz"
  - No per-SKU list [S1]
  - Max TDP as stated: 95W [S1]
  - Disagreement: this sheet gives the Pentium G5400 as **54W**, but the P330 SFF PSREF [S2] and Intel [S4] both say **58W**. Settled on a second check, 2026-11-20: use **58W**, the figure from Intel, the CPU maker [S4]
  - Socket: not stated [S1]. Intel lists the Xeon E-2176G as FCLGA1151, 80 W, ECC yes [S3]
- **Chipset:** Intel C246 [S1]
- **Memory:** "4 DIMM sockets. DDR4-2666. UDIMM. ECC and non-ECC are supported, but memory types cannot be intermixed"; max 64GB (4x 16GB) [S1]
  - "Memory protection ECC with ECC UDIMM. Core i7 and i5 processors cannot support ECC UDIMM" [S1]
  - ECC on Core i3: not stated by Lenovo. Intel lists the i3-8100 as ECC "Yes" [S5]
  - Pentium G5400 memory is DDR4-2400 [S1]
  - RDIMM: not mentioned [S1]
- **Built-in graphics:** UHD 630 on Core, UHD P630 on "-G" Xeons, UHD 610 on the Pentium G5400. No processor graphics are listed for non-G Xeons [S1]
  - Rear display ports need a Core, Pentium or -G Xeon CPU [S1]
- **Expansion slots** [S1]:
  - "Slot 1 PCIe 3.0 x16, full height, half length, links to CPU"
  - "Slot 2 PCIe 3.0 x1, full height, full length, links to PCH"
  - "Slot 3 PCIe 3.0 x16 (negotiable link width x4), full height, half length, links to PCH"
- **Graphics cards:** "Up to two PCIe 3.0 x16 slots for discrete graphics card (Slot 1 and 3)". Factory options [S1]:
  - Quadro P400 30W (max 2), P620 40W (max 2), P1000 47W (max 2), P2000 75W (max 2), P4000 105W (max 1)
  - "Quadro P4000 and 2x Quadro P2000 need 400W PSU." [S1]
  - "400W PSU supports one 6+2-pin aux power connector." [S1]. Whether the 250W PSU has any aux connector: not stated
  - Bay 2 is unavailable when a second P2000 is fitted [S1]
  - Max card length: not stated
- **Storage:**
  - SATA: four onboard 6Gb/s ports, max four SATA devices. Intel SATA AHCI/RAID, RAID 0/1/5/10 [S1]
  - Bays: 3x 3.5" + 1x 2.5", or 4x 2.5" [S1]:
    - Bay 1: 3.5"/2.5"
    - Bay 2: 2.5" SATA
    - Bay 3: 3.5"/2.5"
    - Bay 4: 5.25" flex bay (flex module, removable drive, 5.25-to-3.5 kit or front M.2 enclosure)
    - Bay 5: 9 mm slim ODD
  - M.2: "Up to 3x M.2 SSD with one dedicated onboard M.2 slot plus two PCIe to M.2 adapters. PCIe to M.2 adapter uses slot 1 or 3." "M.2 SSD supports up to 1TB each, PCIe 3.0 x4, NVMe, Opal." [S1]
  - M.2 RAID: RAID 0/1 via the PCH needs the onboard slot plus slot 3 [S1]
  - M.2 length and SATA M.2: not stated
  - Optane: 32GB, one per system, not on Pentium G5400 [S1]
- **Power supply:** "Supports one 250W or 400W power supply, 100V - 240V, 92% PSU." 80 PLUS Platinum [S1]. Proprietary connectors: not stated
- **Networking:** onboard Intel i219LM GbE with Wake-on-LAN. Optional PCIe Ethernet adapters [S1]
  - Wi-Fi is optional: "One dedicated onboard M.2 slot for optional Intel Wireless-AC 9560" [S1]
  - M.2 key and size: not stated
- **Upgrader trip-ups stated in the doc:**
  - Core i5/i7 can't use ECC [S1]
  - Non-G Xeons give no onboard video [S1]
  - Bigger GPUs need the 400W PSU, which has a single 6+2-pin [S1]
  - vPro is on Xeon models only [S1]

Sources:
- [S1] PSREF ThinkStation P330 Tower spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkStation/ThinkStation_P330_Tower/ThinkStation_P330_Tower_Spec.PDF
- [S2] PSREF ThinkStation P330 SFF spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkStation/ThinkStation_P330_SFF/ThinkStation_P330_SFF_Spec.PDF
- [S3] Intel Xeon E-2176G specifications: https://www.intel.com/content/www/us/en/products/sku/134860/intel-xeon-e2176g-processor-12m-cache-up-to-4-70-ghz/specifications.html
- [S4] Intel Pentium Gold G5400 specifications: https://www.intel.com/content/www/us/en/products/sku/129951/intel-pentium-gold-g5400-processor-4m-cache-3-70-ghz/specifications.html
- [S5] Intel Core i3-8100 specifications: https://www.intel.com/content/www/us/en/products/sku/126688/intel-core-i38100-processor-6m-cache-3-60-ghz/specifications.html

Second check, 2026-11-20: 21 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
