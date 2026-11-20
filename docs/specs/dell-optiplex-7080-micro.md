# Dell OptiPlex 7080 Micro

Facts are for the **Micro**. Other 7080 form factors: see `dell-optiplex-7080-sff.md`.

Main source: "OptiPlex 7080 Micro Setup and specifications guide" (HTML topic pages) [S2]–[S9].

- **Form factor:** Micro. External power adapter [S8]
- **CPUs** [S2], all with Intel UHD Graphics 630:
  - 35 W: 10th Gen Core i3-10100T, i3-10300T, i5-10400T, i5-10500T, i5-10600T, i7-10700T, i9-10900T
  - 65 W: i3-10100, i3-10300, i5-10400, i5-10500, i5-10600, i7-10700, i9-10900
  - Socket: not stated [S2]. Intel lists the i5-10500 as "FCLGA1200", 65 W, ECC "No" [S11]
  - Max TDP: not stated. Highest listed is 65 W. The 180 W adapter is "for 65 W CPU and discrete graphics" [S8]
- **Chipset:** "Intel Q470". "PCIe bus": "Up to Gen 3.0" [S3]
- **Memory** [S4]:
  - "Two SODIMM slots", "DDR4"
  - Maximum 64 GB, minimum 4 GB. Per slot: "4 GB, 8 GB, 16 GB, 32 GB". Configurations up to "64 GB, 2 x 32 GB"
  - Speed: "2666 MHz for Intel Core Pentium/i3/i5 processors", "2933 MHz for Intel Core i7/i9 processor". Brazil: i7/i9 at 2666 MHz
  - Note: "If the system configuration includes integrated graphics, consider selecting 2 or more DIMMs"
  - ECC: not stated
- **Built-in graphics** [S7]: Intel UHD Graphics 630, "Two DisplayPort 1.4 HBR2", plus "One VGA/DP 1.4 HBR2/HDMI2.0/USB Type-C Alt-mode (optional)". No listed CPU lacks graphics
- **Expansion slots** [S6]:
  - "One half-height Gen3 PCIe x8 slot (discrete graphics)"
  - Length and power: not stated
  - The fetch tool's summary of the same ports table says the optional video port is not supported with discrete graphics, and that rear USB ports change when discrete graphics are fitted (paraphrased by the tool) [S6]
- **Graphics card limits:**
  - Discrete card listed: "AMD Radeon RX 640", 4 GB GDDR5, two mini DisplayPort plus one DisplayPort 1.4 [S7]
  - Max length, max power and PCIe power cable: not stated
- **Storage** [S5][S6]:
  - "One SATA slots for 2.5-inch Hard-disk drive"
  - M.2: "One M.2 2230 slot for WiFi/Bluetooth card", "One M.2 2230/2280 slot for PCIe solid-state drive/Intel Optane", "One M.2 2280 slot for PCIe solid-state drive/Intel Optane"
  - Also printed in the M.2 list: "One SATA slots for 2.5-inch hard-disk drive (for 35 W and 65 W only)"
  - Supported configurations: one 2.5" HDD; one M.2 2230 or 2280 SSD; two M.2 2230 or 2280 SSDs; one 2.5" HDD plus one M.2 16 or 32 GB Optane
  - Drives: M.2 2230 (Gen 3 PCIe x4 NVMe, Class 35, up to 512 GB), M.2 2280 (Class 40, up to 2 TB), 2.5" HDD, 2.5" SATA SSD (512 GB)
- **Power supply** [S8]:

  | Adapter | Barrel | Input current | Output |
  |---|---|---|---|
  | 90 W ("for 35 W CPU") | 4.5 mm x 2.9 mm | 1.5 A | 19.50 VDC, 4.62 A |
  | 130 W ("for 35 W CPU") | 4.5 mm x 2.9 mm | 2.5 A | 19.50 VDC, 6.7 A |
  | 180 W ("for 65 W CPU and discrete graphics") | 7.4 mm x 5.1 mm | 2.34 A | 19.50 VDC, 9.23 A |

  - Ports table: "4.5 mm DC barrel-type" and "7.4 mm DC barrel-type for 65 W CPU and discrete graphics" [S6]
- **Networking** [S9]:
  - Wired: Intel i219-LM, 10/100/1000 Mbps
  - Wi-Fi options: Qualcomm QCA9377 (Wi-Fi 5, BT 5.0), Qualcomm QCA61x4A (802.11ac, BT 5.0), Intel Wi-Fi 6 AX201 (BT 5.1)
  - Wi-Fi slot: "One M.2 2230 slot for WiFi/Bluetooth card" [S6]. Key letter: not stated
  - Antenna: two SMA connectors, optional (paraphrased by the tool) [S6]
  - Whether Wi-Fi was fitted by default: not stated
- **Upgrade notes stated by Dell:**
  - The 180 W adapter is "for 65 W CPU and discrete graphics" (Dell's wording), and it uses a different barrel (7.4 mm, not 4.5 mm) [S6][S8]. Reading this as 65 W CPU or discrete graphics is an inference, not stated (both smaller adapters are labelled "for 35 W CPU")
  - RAM speed is set by CPU (2666 vs 2933 MHz) [S4]

Sources:
- [S1] Manuals list, OptiPlex 7080 Micro: https://www.dell.com/support/product-details/en-us/product/optiplex-7080-micro/resources/manuals
- [S2] Processors: https://www.dell.com/support/manuals/en-us/optiplex-7080-micro/optiplex7080_micro_specs/processors?guid=guid-6ee4c1e8-08e5-4d13-a046-5769f7734bc4&lang=en-us
- [S3] Chipset: https://www.dell.com/support/manuals/en-us/optiplex-7080-micro/optiplex7080_micro_specs/chipset?guid=guid-a9cbd1bf-175c-420a-b47d-4228a9342322&lang=en-us
- [S4] Memory: https://www.dell.com/support/manuals/en-us/optiplex-7080-micro/optiplex7080_micro_specs/memory?guid=guid-f806e6f5-3400-4366-90f0-4ca5c3361116&lang=en-us
- [S5] Storage: https://www.dell.com/support/manuals/en-us/optiplex-7080-micro/optiplex7080_micro_specs/storage?guid=guid-6dd90062-b4b7-4476-96c5-8d6b318fcd83&lang=en-us
- [S6] Ports and connectors: https://www.dell.com/support/manuals/en-us/optiplex-7080-micro/optiplex7080_micro_specs/ports-and-connectors?guid=guid-8cecb1fe-2dec-44f4-9c25-a771c75b8d8b&lang=en-us
- [S7] Graphics and Video controller: https://www.dell.com/support/manuals/en-us/optiplex-7080-micro/optiplex7080_micro_specs/graphics-and-video-controller?guid=guid-45dde355-217d-4cb8-b70b-68f1c8abf70a&lang=en-us
- [S8] Power adapter: https://www.dell.com/support/manuals/en-us/optiplex-7080-micro/optiplex7080_micro_specs/power-adapter?guid=guid-01262469-b09d-48e0-8ab4-fdbeee523023&lang=en-us
- [S9] Communications: https://www.dell.com/support/manuals/en-us/optiplex-7080-micro/optiplex7080_micro_specs/communications?guid=guid-25120817-dddf-4aed-baf6-cd32f9074c86&lang=en-us
- [S10] PDF of the same guide, could not open (robots_disallowed / proxy 403): https://dl.dell.com/content/manual34046383-optiplex-7080-micro-setup-and-specifications-guide.pdf?language=en-us
- [S11] Intel, Core i5-10500 specifications: https://www.intel.com/content/www/us/en/products/sku/199277/intel-core-i510500-processor-12m-cache-up-to-4-50-ghz/specifications.html

Second check, 2026-11-20: 13 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
