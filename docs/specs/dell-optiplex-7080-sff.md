# Dell OptiPlex 7080 SFF

Facts are for the **Small Form Factor**. Dell also has an "OptiPlex 7080 Tower Setup and specifications guide" (https://dl.dell.com/topicspdf/optiplex-7080-desktop_owners-manual6_en-us.pdf, opened, title only) and an OptiPlex 7080 Micro (`dell-optiplex-7080-micro.md`).

Main source: "OptiPlex 7080 Small Form Factor Setup and Specifications" (HTML topic pages) [S2]–[S11].

- **Form factor:** Small Form Factor
- **CPUs** [S2], all "65 W" with "Intel UHD Graphics 630": 10th Gen Core i3-10100, i3-10300, i5-10400, i5-10500, i5-10600, i7-10700, i9-10900
  - Socket: not stated [S2]. Intel lists the i5-10500 as "FCLGA1200", 65 W, ECC "No" [S14]
  - Max TDP: not stated. All listed CPUs are 65 W
- **Chipset:** "Intel Q470". "PCIe bus": "Up to Gen 3.0". "DRAM bus width": "64-bit (for single channel)" [S3]
- **Memory** [S4]:
  - "Four DIMM slots", "DDR4", "2666/2933 MHz"
  - Maximum 128 GB, minimum 4 GB. "Memory size per slot": "4 GB, 8 GB, 16 GB, 32 GB"
  - Configurations up to "128 GB, 4 x 32 GB". Speed: "2666 MHz for Intel Core i3/i5 processors, 2933 MHz for Intel Core i7/i9 processors"
  - "The Memory speed supported in Brazil for Intel Core i7/i9 processors is 2666 MHz"
  - Notes: "If the system configuration includes integrated graphics, consider selecting 2 or more DIMMs." Install "in pairs of matched memory size, speed, and technology"
  - ECC and UDIMM wording: not stated (the page says only "DDR4") [S4]. Dell product page: ECC not stated [S13]
- **Built-in graphics** [S8]: Intel UHD Graphics 630, two DisplayPort 1.4, for "10th Generation Intel Core i3, i5, i7, and i9". No listed CPU lacks graphics
- **Expansion slots:**
  - The setup guide has no PCIe slot table. The board layout only labels "PCI-e connectors" [S11]
  - Dell product page (SFF): "1 half-height PCIe x16 Gen 3 slot" and "1 half-height PCIe x4 Gen 3 slot" [S13]
  - Add-in cards Dell lists: USB Type-C 3.1 PCIe card, USB Type-A 3.1 Gen 2, 2nd gigabit NIC, "PCIe x1 5/2.5 GbE NIC", "Thunderbolt PCIe Card 3.0", "PCIe Parallel/Serial add-in card (FH)" (printed as FH in the SFF guide), PS/2/Serial bracket, "M.2 SSD Zoom2 Card" [S6]
  - Length: not stated
- **Graphics card limits:**
  - Discrete cards in the setup guide: NVIDIA GeForce GT 730 2 GB GDDR5, AMD Radeon R5 430 2 GB GDDR5, AMD Radeon RX640 4 GB GDDR5 [S8]
  - Note printed on the SFF page: "The tower model supports full-height (FH) cards" [S8]
  - **Conflict:** the Dell product page lists "AMD Radeon RX 640, 6 GB, GDDR5" and "AMD Radeon R5 430, 2 GB, DDR3" [S13]
  - Max length, max power and PCIe power cable: not stated
- **Storage:**
  - Drives listed [S5]: 2.5" HDD (SATA 3.0), 3.5" HDD (SATA 3.0, up to 4 TB at 5400 RPM), "M.2 2230 solid-state drive" (PCIe 3 Gen x4 NVMe, Class 35, up to 512 GB), "M.2 2280 solid-state drive" (PCIe 3 Gen x4 NVMe, Class 40, up to 2 TB)
  - Note: "Upgrading or adding hard-disk drive configurations will require a hard-disk drive kit." [S5]
  - M.2 slots, setup guide ports table [S9]: "One M.2 2230 slot for WiFi and Bluetooth card", "One M.2 2230 slot for solid-state drive", "One M.2 2230/2280 slot for SSD/Intel Optane"
  - **Conflict:** the Dell product page lists "1 M.2 2230/2280 slots for SSD/Intel Optane", "1 M.2 2280 slot for PCIe SSD" and "1 M.2 2230 slot for Wi-Fi and Bluetooth card" [S13]
  - **Third view:** the SFF board layout labels only one "M.2 Solid-state drive connector" plus one "M.2 WLAN connector" [S11]. So the number of M.2 SSD slots (1 or 2) is uncertain, not just their lengths (added on a second check, 2026-11-20)
  - SATA/bays: "3 SATA slots for 3.5-inch HDD, 2.5-inch HDD/SSD, and slim Optical Drive" [S13]. The board layout labels SATA 1, SATA 2, SATA 3 connectors (some labels repeated as printed) and a "SATA power connector" [S11]
- **Power supply** [S7]:
  - "200 W (80 PLUS Bronze)" or "200 W (80 PLUS Platinum)". Input 90–264 VAC, 47–63 Hz, 3.2 A max
  - Output: "+12 VA/16.50 A, +12 VB/14 A, +12 VSB/2.50 A". "Rated output voltage": "+12 VA, +12 VB". That reads as a 12 V-only output (inference, not stated; Dell never says "12 V only")
  - Board layout labels: "CPU power connector (ATX_CPU)", "PSU connector", "SATA power connector" [S11]. Pin counts: not stated
  - **Doc oddity:** the SFF ports table prints "Power port: 4.50 mm x 2.90 mm DC-in", plus "Serial: 1 port" and "PS/2: 2 ports" [S9]. This contradicts the internal 200 W PSU in [S7] and looks like a copy error. Don't rely on it
- **Networking** [S10]:
  - Wired: Intel i219-LM, 10/100/1000 Mbps. RJ-45 rear [S9]
  - Wi-Fi options: Qualcomm QCA61x4a (802.11ac, BT 5.0), Intel Wi-Fi 6 AX201 (802.11ax, BT 5.1), Qualcomm QCA9377 (802.11ac, BT 5.0)
  - Wi-Fi slot: "One M.2 2230 slot for WiFi and Bluetooth card" [S9]. Key letter: not stated. Whether Wi-Fi was fitted by default: not stated
- **Upgrade notes stated by Dell:** RAM speed depends on CPU (2666 i3/i5, 2933 i7/i9) [S4]. Adding an HDD "will require a hard-disk drive kit" [S5]

Sources:
- [S1] Manuals list, OptiPlex 7080 SFF: https://www.dell.com/support/product-details/en-bb/product/optiplex-7080-sff/resources/manuals
- [S2] Processors: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/processors?guid=guid-f23637c8-050e-47e4-bbf2-81fd0a1058e7&lang=en-us
- [S3] Chipset: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/chipset?guid=guid-325f22eb-3095-4692-bab0-cb690c653d93&lang=en-us
- [S4] Memory: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/memory?guid=guid-5dde3559-1c4a-4fe6-a4db-263e2ee75f18&lang=en-us
- [S5] Storage: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/storage?guid=guid-2301cce5-f4bd-4b3e-8f2c-4ffed76c5d58&lang=en-us
- [S6] Add-in cards: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/add-in-cards?guid=guid-b01fb53a-af3f-4c6a-a872-0efde0c5ab54&lang=en-us
- [S7] Power ratings: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/power-ratings?guid=guid-f80b30d8-e7a8-46d4-b919-c05be43ac6bf&lang=en-us
- [S8] Graphics and Video controller: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/graphics-and-video-controller?guid=guid-d027d65d-8a7d-489b-8b82-710c9b272ad8&lang=en-us
- [S9] Ports and connectors: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/ports-and-connectors?guid=guid-20ce5ca0-20ff-40b2-9d6a-5dd9519ec809&lang=en-us
- [S10] Communications: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/communications?guid=guid-25120817-dddf-4aed-baf6-cd32f9074c86&lang=en-us
- [S11] Small Form Factor system board layout: https://www.dell.com/support/manuals/en-bb/optiplex-7080-sff/7080_sff_ss/small-form-factor-system-board-layout?guid=guid-4865b006-d29d-4fb2-840f-7d4b29b7f185&lang=en-us
- [S12] PDF of the same guide, could not open (robots_disallowed / proxy 403): https://dl.dell.com/content/manual31552333-optiplex-7080-small-form-factor-setup-and-specifications.pdf?language=en-us
- [S13] Dell product page, OptiPlex 7080 Tower and SFF (Vietnam business store; SFF section): https://www.dell.com/vn/business/p/optiplex-7080-desktop/pd
- [S14] Intel, Core i5-10500 specifications: https://www.intel.com/content/www/us/en/products/sku/199277/intel-core-i510500-processor-12m-cache-up-to-4-50-ghz/specifications.html

Second check, 2026-11-20: 21 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
