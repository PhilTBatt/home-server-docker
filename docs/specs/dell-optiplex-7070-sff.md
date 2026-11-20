# Dell OptiPlex 7070 SFF

Facts are for the **Small Form Factor**. Dell also has OptiPlex 7070 Tower, Micro (see its own section) and Ultra manuals, e.g. https://www.dell.com/support/manuals/en-us/optiplex-7070-desktop/opti7070_mt_setup_specs/set-up-your-computer (search result) and https://dl.dell.com/topicspdf/optiplex-7070-ultra_owners-manual2_en-us.pdf (search result).

Main source: "Dell OptiPlex 7070 Small Form Factor Setup and Specifications" (HTML topic pages) [S2]–[S9].

- **Form factor:** Small Form Factor
- **CPUs** [S2], all listed at **65 W**:
  - 9th gen: Core i3-9300, i3-9100, i5-9400, i5-9500, i5-9600, i7-9700, i9-9900
  - 8th gen: Core i3-8100, i3-8300, i5-8400, i5-8500, i5-8600, i7-8700
  - Notes: "These are available offline only." The page doesn't say whether this applies to both lists [S2]
  - Socket: not stated [S2]. Intel lists the i5-8500 as "FCLGA1151", 65 W, ECC "No" [S12]
  - Max TDP: not stated. All listed CPUs are 65 W
- **Chipset:** Intel Q370 [S3]
- **Memory** [S4]:
  - "DDR4 DRAM non-ECC". Slots: "4 (UDIMM)"
  - Minimum 4 GB, maximum 64 GB, maximum 16 GB per slot
  - Options: 1x4, 1x8, 2x4, 1x16, 2x8, 2x16, 4x8, 4x16 GB
  - Speed: "2666 MHz memory runs at 2400 MHz on i3 processors"
- **Built-in graphics** [S7]: "Intel UHD Graphics 630", UMA. The CPU dependency is printed as "8th Generation Intel Core Processor i3, i5, i7". The 9th-gen CPUs are not mentioned in the video table. No listed CPU is stated to lack graphics
- **Expansion slots** [S6]. System board drive connectors table, as printed:
  - "PCIe X16 slot": "1 (Support Standard Rev 3.0)"
  - "PCIe X1 slot": 0
  - "PCIe X16 slot (wired x4) slot": 0
  - "PCIe X4": "1 (open ended X4)"
  - Height and length: not stated in the setup guide
  - Dell spec sheet copy: "1 Half Height PCIe x16" and "1 Half Height PCIe x4 (open ended)". The fetch tool inferred the SFF mapping from column order [S11]
- **Graphics card limits:**
  - Discrete cards listed: AMD Radeon R5 430 2 GB, NVIDIA GeForce GT 730 2 GB, AMD Radeon RX 550 4 GB, Dual AMD Radeon R5 430 2 GB [S7]
  - Max length, max power and PCIe power cable: not stated
- **Storage** [S5][S6]:
  - SSD: "M.2 2280/ 2.5 inch", "SATA AHCI, Up to 6 Gbps" or "PCIe 3 x4 NVME, Up to 32 Gbps", up to 2 TB
  - HDD: "2.5 and 3.5 inch", SATA, up to 2 TB. Optical: "1 Slimline". Intel Optane Memory (optional): M.2, 16 GB
  - M.2 connectors: "1 - 2230/2280" and "1 - 2230 (keyed to support Integrated or Discrete WiFi, Support Intel CNVi or USB2.0/PCIe)"
  - SATA: "3 (one Gen2 port for ODD and the rest of the ports support Gen3)"
  - Bays: not stated in the setup guide. Spec sheet copy: "1 x 3.5" or 2 x 2.5" HDD", "1 internal slim ODD" (SFF mapping inferred) [S11]
- **Power supply** [S9]:
  - Input "100-240 Vac", max input current 3.2 A. Wattage: "200W Bronze", "200W Platinum"
  - Spec sheet copy: 200 W typical, 85% efficient 80 PLUS Bronze, or 92% efficient 80 PLUS Platinum (SFF mapping inferred) [S11]
  - Connectors: not stated
- **Networking** [S8]:
  - Wired: "Intel i219-LM Gigabit Ethernet LAN 10/100/1000 (Remote Wake Up, PXE support and Intel Active Management Technology support)"
  - Wi-Fi options: Qualcomm QCA61x4A (2x2 802.11ac + BT 4.2), Intel Wireless-AC 9560 (2x2 802.11ac + BT 5). The spec sheet copy also lists Intel Wireless-AX 200 for the platform, without a form-factor label [S11]
  - Wi-Fi slot: M.2 2230, "Support Intel CNVi or USB2.0/PCIe" [S6]. Key letter: not stated
  - Whether Wi-Fi was fitted by default: not stated
- **Upgrade notes stated by Dell:** RAM runs at 2400 MHz with i3 [S4]. Firmware TPM is "Available in select countries" [S3]

Sources:
- [S1] Manuals list, OptiPlex 7070 SFF: https://www.dell.com/support/product-details/en-ca/product/optiplex-7070-sff/resources/manuals
- [S2] Processor: https://www.dell.com/support/manuals/en-us/optiplex-7070-sff/opti7070_sff_setup_specs/processor?guid=guid-bdd83e9d-d438-4320-8fd9-ce786095e5cc&lang=en-us
- [S3] Chipset: https://www.dell.com/support/manuals/en-us/optiplex-7070-sff/opti7070_sff_setup_specs/chipset?guid=guid-30547629-0d54-478f-8113-5046ebcd599a&lang=en-us
- [S4] Memory: https://www.dell.com/support/manuals/en-us/optiplex-7070-sff/opti7070_sff_setup_specs/memory?guid=guid-7a6c382e-c8af-4ab3-9b68-be050ee50eaa&lang=en-us
- [S5] Storage: https://www.dell.com/support/manuals/en-us/optiplex-7070-sff/opti7070_sff_setup_specs/storage?guid=guid-4eab9a0b-c403-4bcd-b692-9419bddfed24&lang=en-us
- [S6] System board drive connectors: https://www.dell.com/support/manuals/en-us/optiplex-7070-sff/opti7070_sff_setup_specs/system-board-drive-connectors?guid=guid-a828ebb5-0563-42e5-826a-ed9ee262d30b&lang=en-us
- [S7] Video: https://www.dell.com/support/manuals/en-us/optiplex-7070-sff/opti7070_sff_setup_specs/video?guid=guid-b6f3a320-b139-4634-b5c7-56401abf2bfc&lang=en-us
- [S8] Communications: https://www.dell.com/support/manuals/en-us/optiplex-7070-sff/opti7070_sff_setup_specs/communications?guid=guid-366f9f29-287e-4b3b-bdd2-d6881a7cd16f&lang=en-us
- [S9] Power supply: https://www.dell.com/support/manuals/en-us/optiplex-7070-sff/opti7070_sff_setup_specs/power-supply?guid=guid-475c5c8b-0f34-45e9-a49f-b5ba4c3b27c3&lang=en-us
- [S10] PDF of the same guide, could not open (robots_disallowed / proxy 403): https://dl.dell.com/content/manual34661968-dell-optiplex-7070-small-form-factor-setup-and-specifications.pdf?language=en-us
- [S11] Dell "Features & Technical Specifications, OptiPlex 7070 Tower, Small Form Factor and Micro" (no date), hosted by a Dell distributor (Redington), not by Dell: https://redingtongroup.com/india/delltechnologies/files/optiplex_7070_spec_sheet.pdf
- [S12] Intel, Core i5-8500 specifications: https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/specifications.html

Second check, 2026-11-20: 12 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
