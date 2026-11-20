# Dell Precision 3630 Tower

Facts are for the **Tower**, the only form factor I found under this name. Dell's accessory guides call it "Precision Tower 3630" [S1].

Sources used:
- Dell's HTML "Precision 3630 Tower Setup and Specifications Guide" [S2]–[S9]
- The same guide as a PDF I could open: Rev. A02, August 2020, Regulatory Model D24M [S10]
- Dell Japan's "Dell Precision 3630 Tower Technical Guidebook", 2019-07, Rev. A01 [S11]

- **Form factor:** Tower
- **CPUs** [S2]:
  - Xeon E: E-2224 (71 W), E-2224G (80 W), E-2236 (71 W), E-2246G (80 W), E-2274G (80 W), E-2286G (95 W), E-2124 (71 W), E-2124G (80 W), E-2136 (71 W), E-2146G (80 W), E-2174G (80 W), E-2186G (95 W)
  - Core 9th gen: i3-9100 (65 W), i5-9500 (65 W), i5-9600 (65 W), i7-9700 (65 W), i7-9700K (95 W), i9-9900 (wattage not printed), i9-9900K (wattage not printed)
  - Core 8th gen: i3-8100 (65 W), i5-8500 (65 W), i5-8600 (65 W), i7-8700 (65 W), i7-8700K (91 W)
  - Pentium Gold: G5420 (65 W), G5400 (65 W)
  - Socket: not stated [S2][S10][S11]. Intel lists the Xeon E-2224 as "FCLGA1151", 71 W, ECC "Yes" [S13], and the i5-8500 as "FCLGA1151", ECC "No" [S14]
  - Max TDP: highest printed is 95 W. Board item "VR Heatsink" is "only with the 95 W heat sink solution" [S8][S10][S11]
- **Chipset:** "Intel C246 chipset" [S10][S11]
- **Memory:**
  - "4 UDIMM slots". Minimum 4 GB, maximum 128 GB, maximum 32 GB per slot [S3]
  - Type: "DDR4 SDRAM or ECC memory" [S3]
  - Options: 8 GB (1x8) and larger are listed "ECC/ Non-ECC". 4 GB (1x4), 8 GB (2x4) and 16 GB (4x4) are listed "Non-ECC" only [S3]
  - **Speed conflict:** the HTML guide says "3200 MHz" [S3]. The PDF Rev. A02 [S10] and the Technical Guidebook [S11] say "2666 MHz" with 6-core CPUs and "2400 MHz" with 4-core CPUs
  - Partly settled on a second check (2026-11-20): Intel lists "Memory Types" "DDR4-2666" for both the Xeon E-2224 [S13] and the Core i5-8500 [S14]. That backs the 2666/2400 MHz figures as operating speeds. Don't treat the HTML's "3200 MHz" as the speed the RAM will run at
  - Which CPUs support ECC: not stated by Dell [S3][S10][S11]. Intel says ECC "Yes" for the Xeon E-2224 [S13] and "No" for the Core i5-8500 [S14]
- **Built-in graphics** [S2][S5]:
  - "None" for Xeon E-2224, E-2236, E-2124, E-2136 (the non-G Xeons)
  - "Intel UHD Graphics P630" for Xeon E-21xxG/22xxG
  - "Intel UHD Graphics 630" for 9th-gen Core and "Intel HD Graphics 630" for 8th-gen Core (as printed)
  - "Intel UHD Graphics 610" for Pentium Gold
  - The video table lists "DisplayPort X 2" for integrated graphics [S5]
- **Expansion slots:**
  - Board layout, top to bottom: "Full Height PCIe x16", "PCI x1" (as printed), "Two Full Height PCIe x4". Plus an "Optional card connector (VGA, HDMI, DP, USB Type-C)" [S8]
  - Technical Guidebook (as summarised by the fetch tool): x16 slot is Gen 3 x16; the two x4 slots are Gen 3 x4, "(Open ended)"; the fourth slot is a "PCI" slot; all full height; an expansion card support bracket is included [S11]
  - Guidebook tables 24–27, "System board connector maximum add-in card allowable dimensions", print the same values for every slot and for the M.2 slot: height 4.38 in / 11.12 cm, length 4.50 in / 11.44 cm, 75 W, 3.3/12 V [S11]. Because the identical figures are also given for the M.2 slot, these look like template values. Don't use 4.5 in as a GPU length limit
- **Graphics card limits:**
  - "NOTE: Graphics cards with power rating equals to or more than 75 Watts requires a 6-pin and/or 8-pin power connector dongle." [S5][S10]
  - Discrete families listed: NVIDIA Quadro P series (P400–P5000), GeForce GTX 1080/1060, Quadro RTX 4000/5000, GeForce RTX 2060 SI / 2080B / 2080 Super, AMD Radeon Pro WX 2100–7100 and RX580 [S5]
  - Required PSU per card (Technical Guidebook, as summarised by the fetch tool) [S11]:
    - 300 W, 460 W or 850 W: P400, P620, P1000, P2000, WX2100–WX5100
    - 460 W or 850 W: P4000 (105 W), P5000 (180 W), WX7100 (130 W), RX580 (180 W), GTX 1060 (150 W), GTX 1080 (180 W), RTX 4000 (160 W), RTX 2060 SI (160 W)
    - 850 W only: RTX 5000, RTX 2080B (215 W)
    - Aux connector per card: none for the ≤75 W cards; 6-pin for P4000, WX7100, RX580; 8-pin for P5000, GTX 1060, GTX 1080, RTX 4000, RTX 5000, RTX 2060 SI, RTX 2080B
  - Dell publishes a "Precision Tower 3630 Dual Graphics card Installation Guide" [S1]. Max number of cards: not stated
  - Max card length: not reliably stated (see above)
- **Storage:**
  - M.2 SSD: "M.2 2280/ 2260/ 2242 PCIe x4", "SATA AHCI, Up to 6 Gbps" or "PCIe 3 x 4 NVME, Up to 32 Gbps", up to 2 TB [S4]
  - **Conflict:** the Guidebook gives the on-board M.2 lengths as 2280, 2230 or 2242 [S11]. The board has one M.2 SSD connector [S8][S10]
  - The PDF Rev. A02 also says "M.2 2280/ 2260/ 2242", agreeing with the HTML guide [S10][S4]. Only the 2019 Guidebook says 2230, and none of the three documents explains the difference (added on a second check, 2026-11-20)
  - 2.5" HDD up to 2 TB; 2.5" SSD up to 1 TB; 3.5" HDD up to 8 TB; "Zoom2 card" M.2 2280 PCIe x4 add-in [S4]
  - SATA: "four SATA connectors on the system board" [S11]. **Conflict:** the PDF's BIOS "Drives" option lists SATA-0 to SATA-4, i.e. 5 SATA entries [S10] (conflict marked on a second check, 2026-11-20)
  - Bay count: not stated. Storage matrix: with an M.2 primary drive, "Upto 3x 3.5" / 4x 2.5" SATA SSD/HDD / PCIe SSD M.2 Interposer Card" [S10][S11]
  - Optional front bay devices: optical drive or CAC reader, and media card reader [S11]
- **Power supply:**
  - "80 plus bronze certification": "300 W EPA bronze (No SD)" [S6]
  - "80 plus gold certification": "300 W / 460 W (w/SD) and 850 W(w/SD)" [S6]. "SD" is not defined on the page
  - "Energy efficient power supply": "Internal" [S6]. Guidebook: input 100–240 VAC; the 850 W configuration includes an extra front fan [S11]
  - Board labels: "ATX PSU power connector" and "Power (CPU)" [S8]. Pin counts: not stated
- **Networking:**
  - Wired: "RJ45 Network adapter (10/100/1000 Mbps)": "Intel Ethernet Connection I219 Series" [S9]
  - Wi-Fi options: "Intel Dual Band Wireless-AC 9260 ... 802.11AC 2x2 Wi-Fi + BT 5 LE M.2 Wireless Card", "Qualcomm QCA9377 dual band WiFi and Bluetooth Card" [S9]
  - Wi-Fi slot: "M.2 2230 Key-AE" (Guidebook, as summarised by the fetch tool) [S11]. Whether fitted by default: not stated
  - Add-in NICs listed: "1 GB NIC, 2.5 GB/5 Gb NIC" [S9]
- **Upgrade notes stated by Dell:**
  - 95 W CPUs come with a "95 W heat sink solution" that includes a VR heatsink [S8][S11]
  - Cards ≥75 W need a 6/8-pin dongle, and the bigger cards need the 460 W or 850 W PSU [S5][S11]
  - The motherboard page says a front fan connector may be absent on older boards: "Computers purchased before July, 19 did not have provision for front fan and old system board may not have this connector." [S8] (corrected on a second check, 2026-11-20: the date is printed as "July, 19", not cut off)

Sources:
- [S1] Manuals list, Precision 3630: https://www.dell.com/support/product-details/en-us/product/precision-3630-workstation/resources/manuals
- [S2] Processor: https://www.dell.com/support/manuals/en-us/precision-3630-workstation/prec_3630_specifications_manual/processor?guid=guid-17014aff-dc79-4209-89da-b82b62be2c0f&lang=en-us
- [S3] Memory: https://www.dell.com/support/manuals/en-us/precision-3630-workstation/prec_3630_specifications_manual/memory?guid=guid-f235f4d9-d0d3-49c4-bd58-483ed06a6808&lang=en-us
- [S4] Storage: https://www.dell.com/support/manuals/en-us/precision-3630-workstation/prec_3630_specifications_manual/storage?guid=guid-fc01cc34-9e82-464e-b147-764abe257674&lang=en-us
- [S5] Video card: https://www.dell.com/support/manuals/en-us/precision-3630-workstation/prec_3630_specifications_manual/video-card?guid=guid-064c014d-b4c3-405e-a8e7-ba6d0d868dda&lang=en-us
- [S6] Power Supply: https://www.dell.com/support/manuals/en-us/precision-3630-workstation/prec_3630_specifications_manual/power-supply?guid=guid-81be58ac-3d32-4325-854e-0b4cad3016b5&lang=en-us
- [S7] Ports and connectors: https://www.dell.com/support/manuals/en-us/precision-3630-workstation/prec_3630_specifications_manual/ports-and-connectors?guid=guid-1ea500ba-2b9f-41e7-af75-ecca9f1c02f8&lang=en-us
- [S8] Motherboard layout: https://www.dell.com/support/manuals/en-us/precision-3630-workstation/prec_3630_specifications_manual/motherboard-layout?guid=guid-cd1ddaa0-081a-4f7c-8018-2b5cfb5a2b23&lang=en-us
- [S9] Communication: https://www.dell.com/support/manuals/en-us/precision-3630-workstation/prec_3630_specifications_manual/communication?guid=guid-3dff3721-5169-4cb1-90e7-0de656cf35f6&lang=en-us
- [S10] "Precision 3630 Tower Setup and Specifications Guide", Rev. A02, Aug 2020 (PDF, opened): https://dl.dell.com/topicspdf/precision-3630-workstation_owners-manual_en-us.pdf
- [S11] "Dell Precision 3630 Tower Technical Guidebook", 2019-07, Rev. A01 (Dell Japan site): https://japancatalog.dell.com/c/wp-content/uploads/Dell_Precision_Tower_3630_Technical_Guide_Book.pdf
- [S12] Newer PDF of the setup guide, could not open (robots_disallowed / proxy 403): https://dl.dell.com/content/manual56436443-precision-3630-tower-setup-and-specifications-guide.pdf?language=en-us
- [S13] Intel, Xeon E-2224 specifications: https://www.intel.com/content/www/us/en/products/sku/191036/intel-xeon-e2224-processor-8m-cache-3-40-ghz/specifications.html
- [S14] Intel, Core i5-8500 specifications: https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/specifications.html

Second check, 2026-11-20: 27 facts checked against the cited pages; 1 corrected; 2 couldn't be checked.
