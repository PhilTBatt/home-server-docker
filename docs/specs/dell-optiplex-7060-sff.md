# Dell OptiPlex 7060 SFF

Facts are for the **Small Form Factor**. Dell also has an "OptiPlex 7060 Tower Setup and specifications guide" [S5] and an OptiPlex 7060 Micro guide (search result only, https://www.dell.com/support/manuals/en-us/optiplex-7060-micro/opti_7060_mff_setup_specs_manual).

Main source: "OptiPlex 7060 Small Form Factor Setup and specifications guide", Regulatory Model D11S, Rev. A02, October 2021 [S2].

- **Form factor:** Small Form Factor [S2]
- **CPUs:** six CPUs, all "65W": Core i3-8100, i3-8300, i5-8400, i5-8500, i5-8600, i7-8700 [S2]. The video table calls them "8th Generation Intel Core Processor i3, i5,i7" [S2]
  - Socket: not stated [S2]. Intel lists the i5-8500 as "FCLGA1151", 65 W, ECC "No" [S4]
  - Max TDP: not stated. All listed CPUs are 65 W
- **Chipset:** Intel Q370 [S2]
- **Memory** [S2]:
  - "DDR4 DRAM, non-ECC". Slot type: UDIMM
  - Slots: 4. Minimum 4 GB, maximum 64 GB, maximum 16 GB per slot
  - Configurations: 1x4, 1x8, 2x4, 2x8, 1x16, 2x16, 4x8, 4x16 GB
  - Speed: 2666 MHz memory "will perform at 2400 MHz on i3 processors"
- **Built-in graphics:** Intel UHD Graphics 630 for all six CPUs (UMA, shared memory). No listed CPU lacks graphics [S2]
- **Expansion slots** [S2]. The system board connectors table, as printed:
  - "PCIe X16 slot": 1, "Support Standard Rev 3.0"
  - "PCIe X1 slot": 0
  - "PCIe X16 slot (wired x4)": 0
  - "PCIe X4": 1, "open ended X4"
  - Height and length: not stated in the setup guide [S2]
  - Dell spec sheet: "1 Half Height PCIe x16" and "1 Half Height PCIe x4 (open ended)". The sheet's text doesn't label which form factor each line is for, so the fetch tool inferred the SFF mapping from list order [S3]
- **Graphics card limits:**
  - Discrete cards listed: AMD Radeon R5 430 2 GB, NVIDIA GeForce GT 730 2 GB, AMD Radeon RX 550 4 GB, Dual AMD Radeon R5 430 2 GB. The SFF guide does not say which apply to SFF [S2]
  - Max length, max power and PCIe power cable: not stated [S2]
  - Note: if a discrete card is fitted, the back-panel HDMI/DisplayPort are covered and the display must go to the card [S2]
- **Storage** [S2]:
  - M.2 SSD slot: "1 - 2230/2280". Drives: "SATA AHCI up to 6 Gbps" or "PCIe 3 x4 NVMe up to 32 Gbps", up to 2 TB. Intel Optane 16 GB also listed
  - SATA: "Serial ATA (SATA) connector 3 (one Gen2 port for ODD and the rest of the ports support Gen3)". **Conflict:** the BIOS "Drives" option in the same guide lists SATA-0, SATA-2, SATA-3, SATA-4 and M.2 PCIe SSD-0, i.e. 4 SATA entries [S2]
  - Bays: not stated in the setup guide. It lists the 2.5"/3.5" HDD and an optional "Slim SATA" optical drive as options [S2]. Dell spec sheet: "1 x 3.5" or 2 x 2.5" HDD" for SFF [S3]
- **Power supply** [S2]:
  - "200W Bronze" or "200W Platinum". Input 90–264 VAC, max input current 3.2 A
  - Dell spec sheet: 200 W typical, 85% efficient (80 PLUS Bronze) or 92% efficient (80 PLUS Platinum), Active PFC. SFF mapping inferred from order [S3]
  - Connectors: not stated
- **Networking** [S2]:
  - Wired: Intel i219-LM Gigabit Ethernet, 10/100/1000 (Remote Wake Up, PXE, Intel AMT)
  - Wi-Fi options: Qualcomm QCA61x4A (2x2 802.11ac + BT 4.2), Intel Wireless-AC 9560 (2x2 802.11ac + BT 5)
  - Wi-Fi slot: "1 - 2230 (keyed to support Integrated or Discrete WiFi, Support Intel CNVi or USB2.0/PCIe)". Key letter: not stated
  - "Antenna SMA connectors (optional)" on the back panel. Whether Wi-Fi was fitted by default: not stated
- **Upgrade notes stated by Dell:** RAM runs at 2400 MHz with i3 [S2]. Back video ports are covered when a dGPU is fitted [S2]

Sources:
- [S1] Manuals list, OptiPlex 7060 SFF: https://www.dell.com/support/product-details/en-us/product/optiplex-7060-sff/resources/manuals
- [S2] "OptiPlex 7060 Small Form Factor Setup and specifications guide" (PDF, opened): https://dl.dell.com/topicspdf/optiplex-7060-desktop_Specifications2_en-us.pdf
- [S3] Dell spec sheet "OptiPlex 7060 Tower, Small Form Factor and Micro" (date not stated): https://i.dell.com/sites/csdocuments/shared-content_data-sheets_documents/en/optiplex_7060_spec_sheet.pdf (redirected from https://www.dell.com/learn/al/en/albsdt1/shared-content~data-sheets~en/documents~optiplex_7060_spec_sheet.pdf)
- [S4] Intel, Core i5-8500 specifications: https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/specifications.html
- [S5] "OptiPlex 7060 Tower Setup and specifications guide" (opened; used only to confirm a Tower variant exists): https://dl.dell.com/topicspdf/optiplex-7060-desktop_specifications_en-us.pdf

Second check, 2026-11-20: 21 facts checked against the cited pages; 0 corrected; 2 couldn't be checked.
