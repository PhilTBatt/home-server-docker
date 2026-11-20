# Dell OptiPlex 7090 SFF

Facts are for the **Small Form Factor**. Dell also has an "OptiPlex 7090 Tower Setup and Specifications" (https://dl.dell.com/topicspdf/optiplex-7090-desktop_Owners-Manual8_en-us.pdf, opened, title only), an OptiPlex 7090 Micro (https://dell.com/support/manuals/en-us/optiplex-7090-desktop/opti7090mff_setupspecs/set-up-your-optiplex-7090-micro, search result) and a 7090 Ultra (https://dl.dell.com/topicspdf/optiplex-7090-ultra_Owners-Manual8_en-us.pdf, search result).

Main source: "OptiPlex 7090 Small Form Factor Setup and Specifications" (HTML topic pages) [S2]–[S12].

- **Form factor:** Small Form Factor
- **CPUs** [S2], all "65 W":
  - 10th gen: Core i3-10105, i3-10305, i5-10400, i5-10500, i5-10505, i5-10600, i7-10700, i9-10900 (Intel UHD Graphics 630)
  - 11th gen: Core i5-11400 (UHD 730), i5-11500, i5-11600, i7-11700, i9-11900 (UHD 750)
  - Socket: not stated [S2]. Intel lists both the i5-10500 [S14] and the i5-11500 [S15] as "FCLGA1200", 65 W, ECC "No"
  - Max TDP: not stated. All listed CPUs are 65 W
- **Chipset:** "Intel Q570" for both CPU generations. "DRAM bus width": "64-bit, Dual-channel". "PCIe bus": "Up to Gen 3.0" [S3]
- **Memory** [S4]:
  - "Four UDIMM slots", "DDR4", "2666/2933/3200 MHz"
  - Maximum 128 GB, minimum 4 GB. Per slot: "4 GB, 8 GB, 16 GB, 32 GB"
  - Speed by CPU, as summarised by the fetch tool: 10th-gen i3/i5 2666 MHz; 10th-gen i7/i9 2933 MHz; 11th-gen i5/i7/i9 3200 MHz for most configs, "2933/3200 MHz" for 32 GB and 64 GB configs, and "2933 MHz" for 128 GB (4 x 32 GB)
  - ECC: not stated
- **Built-in graphics** [S7]: UHD 630 (10th gen), UHD 730 (i5-11400), UHD 750 (other 11th gen). Each has two DisplayPort 1.4. No listed CPU lacks graphics
- **Expansion slots** [S6]:
  - "One Half-height Gen4 PCIe x16 slot"
  - "One Half-height Gen3 PCIe x4 slot"
  - **Conflict:** the chipset table says "PCIe bus: Up to Gen 3.0" [S3]
  - Mostly settled on a second check (2026-11-20): a second Dell page, the Dell Thailand business product page, also lists for the SFF "1 half-height Gen 4 PCIe x16 slot" and "1 half-height Gen 3 PCIe x4 slot" [S16]. That block is unlabelled; the fetch tool identified it as the SFF by position. So two Dell sources say the x16 slot is Gen4, and the chipset table is the outlier. Neither page says whether Gen4 needs an 11th-gen CPU, so don't assume it either way
  - Length: not stated
- **Graphics card limits:**
  - Discrete cards listed [S8]: AMD Radeon RX640 4 GB GDDR5, "AMD Radeon 550" 2 GB GDDR5, "AMD Radeon 540" 1 GB GDDR5
  - Max length, max power and PCIe power cable: not stated
- **Storage** [S5][S6]:
  - "Three SATA 3.0 slot for 3.5-inch/2.5-inch hard drive and slim optical drive"
  - M.2: "One M.2 2230 slot for WiFi and Bluetooth card", "One M.2 2230/2280 slot for SSD/Intel Optane", "One M.2 2280 slot for SSD/Intel Optane"
  - Drives: 2.5" HDD, 3.5" HDD (up to 4 TB), "M.2 2230, Class 35" and "M.2 2280, Class 40" SSDs, "PCIe NVMe Gen3 x4"
  - The storage matrix includes "Dual M.2 PCIe solid-state drive", with a 2.5" or 3.5" HDD, and "Dual 2.5-inch hard drive". The matrix columns came back misaligned from the fetch tool, so exact combinations are not reproduced here
- **Power supply:**
  - "200 W (80 PLUS Bronze)" or "300W (80 PLUS Platinum)". Input 90–264 VAC, 47–63 Hz [S11]
  - Max input current 3.2 A (200 W) / 4.2 A (300 W). Output: 200 W "12 VA/16.5 A 12 VB/14 A"; 300 W "12 VA/28 A 12 VB/18 A". Rated output "+12 VA +12 VB" [S11]
  - Cables, both PSUs: "Two 4 pin connectors for processor", "One 6 pin connector for system board" [S12]. Dell does not use the word "proprietary"
- **Networking:**
  - Wired: "Intel I219", 10/100/1000 Mbps [S9]
  - Wi-Fi options: Qualcomm QCA61x4a (Wi-Fi 5, BT 5.0), Qualcomm QCA9377 (Wi-Fi 5, BT 5.0), Intel AX201 (Wi-Fi 6, BT 5.1) [S10]
  - Wi-Fi slot: "One M.2 2230 slot for WiFi and Bluetooth card" [S6]. Key letter: not stated. Whether Wi-Fi was fitted by default: not stated
- **Upgrade notes stated by Dell:**
  - RAM speed depends on CPU generation and model, and on capacity with 11th gen [S4]
  - Slot generation conflict (Gen4 x16 in [S6] vs "Up to Gen 3.0" in [S3]). The Dell Thailand product page [S16] also says Gen 4, so the chipset table is the outlier (added on a second check, 2026-11-20)

Sources:
- [S1] Manuals list, OptiPlex 7090 SFF: https://www.dell.com/support/product-details/en-bb/product/optiplex-7090-sff/resources/manuals
- [S2] Processors: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/processors?guid=guid-02117de0-367e-4095-97c8-5e9bf67aef06&lang=en-us
- [S3] Chipset: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/chipset?guid=guid-bba0c013-8936-45b9-a5f2-00d33e2efb93&lang=en-us
- [S4] Memory: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/memory?guid=guid-e9d2ea83-38a4-431d-803c-96d63c1dbc34&lang=en-us
- [S5] Storage: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/storage?guid=guid-3f3ccec0-9d0f-41a3-9451-e7b76ba12f65&lang=en-us
- [S6] Internal slots: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/internal-slots?guid=guid-7a76fefc-0e71-48db-ab2c-83561811fba5&lang=en-us
- [S7] GPU—Integrated: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/gpuintegrated?guid=guid-0f264593-4edf-4b32-99db-62322993f7af&lang=en-us
- [S8] GPU—Discrete: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/gpudiscrete?guid=guid-759e1e16-43db-48c9-9a02-43500e3cbeea&lang=en-us
- [S9] Ethernet: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/ethernet?guid=guid-1aa4a0e2-6f6d-43b4-9b1b-ed7ad2b5d139&lang=en-us
- [S10] Wireless module: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/wireless-module?guid=guid-7dd4e94b-d18f-47a5-8d48-ab691dde331e&lang=en-us
- [S11] Power ratings: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/power-ratings?guid=guid-62a71595-e1bb-408f-86e0-f3e450812e4b&lang=en-us
- [S12] Power Supply power cable specs: https://www.dell.com/support/manuals/en-bb/optiplex-7090-sff/d11_optiplex_7090_sff_ss/power-supply-power-cable-specs?guid=guid-963ddfd5-2de5-4563-a9b6-20fa29b7ee69&lang=en-us
- [S13] PDF of the same guide, could not open (robots_disallowed / proxy 403): https://dl.dell.com/content/manual60216691-optiplex-7090-small-form-factor-setup-and-specifications.pdf?language=en-us
- [S14] Intel, Core i5-10500 specifications: https://www.intel.com/content/www/us/en/products/sku/199277/intel-core-i510500-processor-12m-cache-up-to-4-50-ghz/specifications.html
- [S15] Intel, Core i5-11500 specifications: https://www.intel.com/content/www/us/en/products/sku/212277/intel-core-i511500-processor-12m-cache-up-to-4-60-ghz/specifications.html
- [S16] Dell product page, OptiPlex 7090 desktop (Thailand business store; SFF block identified by position), added on a second check, 2026-11-20: https://www.dell.com/th/business/p/optiplex-7090-desktop/pd

Second check, 2026-11-20: 13 facts checked against the cited pages; 0 corrected; 1 couldn't be checked.
