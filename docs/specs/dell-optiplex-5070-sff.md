# Dell OptiPlex 5070 SFF

Facts are for the **Small Form Factor**. Dell also sells an OptiPlex 5070 Tower and Micro. The 5070 SFF spec tables print Tower / SFF / Micro side by side, and only the SFF column is used below unless marked [S3][S5].

- **Form factor:** Small Form Factor. "Tower supports Full Height (FH) cards and Small Form Factor supports low profile (LP) cards." [S6][S9]
- **CPUs:** two tables, both captioned "offered offline only" [S2]. Tower/SFF CPUs, all listed at **65 W** [S2]:
  - 9th gen: Pentium G5420, Pentium G5600, Core i3-9100, i3-9300, i5-9400, i5-9500, i5-9600, i7-9700
  - 8th gen: Core i7-8700, i5-8500, i5-8400, i3-8300, i3-8100, Pentium Gold G5500, Pentium Gold G5400, Celeron G4900
  - The 35 W "T" CPUs in the same tables are Micro only [S2]
  - Socket: not stated [S2]. Intel lists the i5-8500 (in the list above) as "FCLGA1151", TDP "65 W", ECC "No" [S11]
  - Max TDP: not stated. Every Tower/SFF CPU listed is 65 W [S2]
- **Chipset:** "Intel Q370 Chipset" [S8]
- **Memory** [S3]:
  - "DDR4 DRAM Non-ECC Memory". "2666 MHz on i5 and i7 processors (performs at 2400 MHz on Celeron, Pentium and i3 processors)"
  - DIMM slots: 4 (SFF). "UDIMM support: Yes". DIMMs/channel: 2
  - Minimum 4 GB, maximum 64 GB (SFF)
  - Configurations listed for SFF: 1x4, 2x4, 1x8, 2x8, 1x16, 4x8, 2x16, 4x16 GB. The largest stick listed is 16 GB. The memory table also has a row labelled "DIMM Capacities" reading "Up to 64 GB" for Tower and SFF (as returned by the fetch tool; added on a second check, 2026-11-20). That is the same figure as the system maximum, so it is ambiguous whether it is meant as a per-slot limit. No other per-slot maximum is stated
  - Note: "Memory modules should be installed in pairs of matched memory size, speed, and technology". Unmatched pairs work "with a slight reduction in performance"
  - ECC: Non-ECC [S3]
- **Built-in graphics** [S6]: "Intel UHD 630 Graphics [with 9th Generation Core i3/i5/i7 CPU-GPU combo]" and "Intel UHD 610 Graphics [with 9th Generation Pentium CPU-GPU combo]". The graphics table does not list the 8th-gen CPUs. No CPU in the list is stated to lack graphics
- **Expansion slots** [S5]:
  - "PCIe x16 Slot(s)": 1 (SFF)
  - "PCIe x16 (wired x4) Slot(s)": SFF cell reads "1 x4 open ended". The fetch tool flagged this cell as ambiguous
  - "PCIe x1 Slot(s)": 0 (SFF)
  - Footnotes: PCIe slots "Standard Rev 3.0"
  - Height: low profile (LP) on SFF [S6][S9]. Length: not stated
  - Max card dimensions: the page refers readers to the "Detailed Engineering Specifications", which I did not find [S5]
- **Graphics card limits:**
  - Discrete options listed for SFF: "2 GB AMD Radeon R5 430", "2 GB NVIDIA GeForce GT 730", "4 GB AMD Radeon RX 550", "2 GB Dual AMD Radeon R5 430". "4 GB Dual AMD Radeon RX 550" is "Not available" on SFF (Tower only) [S6]
  - "Support for Dual 25 W Graphics": Yes (SFF). "Support for Dual 50 W Graphics": N/A (SFF), Yes (Tower) [S9]
  - Max card length, max card power and PCIe power cable: not stated
- **Storage** [S4][S5]:
  - Optical: "1 Slim" (SFF)
  - Internal HDD bay: "1 x 3.5" or 2 x 2.5"" (SFF). Max 3.5"/2.5" drives: 1/2
  - SATA: storage table shows SATA 2.0: 1 and SATA 3.0: 2 (SFF) [S4]. Board table: "Serial ATA (SATA)": 3 (SFF), with "one Gen2 SATA port for an optical drive" and the rest Gen3 (footnote, as summarised by the fetch tool) [S5]
  - M.2: "M.2 Socket 3 (for SSD)": "1 - 2280/2230". The footnote says Socket 3 supports both SATA and PCIe [S5]. Drive list includes PCIe NVMe Class 35/40 M.2 SSDs [S4]
  - Footnote as printed: "12.5 Inch Solid State Drives are only available as a secondary storage option", paired with an M.2 SSD as primary [S4]. The leading "1" is most likely the footnote marker (footnote 1) run into "2.5 Inch", not a typo (inference, not stated; on a second check, 2026-11-20, the fetch tool described this as footnote 1)
- **Power supply:** not stated in the Setup and Specifications (it has no power supply topic). Not found in any Dell document I could open
- **Networking:**
  - Wired: "Network Connector (10/100/1000 RJ-45)": 1 rear [S9]. Controller model: not stated in the 5070 SFF document [S7]
  - Wi-Fi: options listed are Qualcomm QCA9377 (1x1 802.11ac + BT 4.1), Qualcomm QCA61x4A (2x2 802.11ac + BT 4.2) and Intel Wireless-AC 9560 (2x2 802.11ac + BT 5). "Support for 802.11n and 802.11ac wireless NIC: Yes via M.2". Internal antennas and external antenna connectors: Yes [S7]
  - Wi-Fi slot: "M.2 Socket 1 (for WiFi/BT card)": "1 - 2230". The footnote says it supports Intel CNVi or USB 2.0/PCIe. Key letter: not stated [S5]
  - Whether Wi-Fi was fitted by default: not stated
- **Upgrade notes stated by Dell:**
  - Both CPU tables are captioned "offered offline only" [S2]
  - The SFF "supports low profile (LP) cards" (Dell's wording; that it takes LP cards only is an inference, not stated), and its dual-graphics support is for 25 W cards [S6][S9]
  - RAM speed drops to 2400 MHz with Celeron, Pentium and i3 [S3]

Sources:
- [S1] Manuals list, OptiPlex 5070 SFF: https://www.dell.com/support/product-details/en-bb/product/optiplex-5070-sff/resources/manuals
- [S2] Setup and Specs, Processor: https://www.dell.com/support/manuals/en-bb/optiplex-5070-sff/opti5070_sff_setup_specs/processor?guid=guid-db4c539b-896d-4290-8b27-72852612e4b4&lang=en-us
- [S3] Memory: https://www.dell.com/support/manuals/en-bb/optiplex-5070-sff/opti5070_sff_setup_specs/memory?guid=guid-855fa707-df43-4819-901c-939445262279&lang=en-us
- [S4] Storage: https://www.dell.com/support/manuals/en-bb/optiplex-5070-sff/opti5070_sff_setup_specs/storage?guid=guid-b9a8195c-d60a-4f32-b84d-145ebf7f3131&lang=en-us
- [S5] System board connectors: https://www.dell.com/support/manuals/en-bb/optiplex-5070-sff/opti5070_sff_setup_specs/system-board-connectors?guid=guid-bc9c0b97-b91b-4c5d-91d0-ee6781eca04d&lang=en-us
- [S6] Graphics and Video Controller: https://www.dell.com/support/manuals/en-bb/optiplex-5070-sff/opti5070_sff_setup_specs/graphics-and-video-controller?guid=guid-79701b15-383b-4fcc-915f-c28ccf7f49bc&lang=en-us
- [S7] Communications—Wireless: https://www.dell.com/support/manuals/en-bb/optiplex-5070-sff/opti5070_sff_setup_specs/communicationswireless?guid=guid-9bbc74de-adfa-4307-9902-7556407e5db8&lang=en-us
- [S8] Chipset: https://www.dell.com/support/manuals/en-bb/optiplex-5070-sff/opti5070_sff_setup_specs/chipset?guid=guid-70e54077-ba21-4057-9a09-e22a9610cd9f&lang=en-us
- [S9] External ports and connectors: https://www.dell.com/support/manuals/en-bb/optiplex-5070-sff/opti5070_sff_setup_specs/external-ports-and-connectors?guid=guid-7912cf60-0f2a-42d5-a906-cfa1dea38677&lang=en-us
- [S10] PDF of the same guide, could not open (robots_disallowed / proxy 403): https://dl.dell.com/content/manual27891805-dell-optiplex-5070-small-form-factor-setup-and-specifications.pdf?language=en-us
- [S11] Intel, Core i5-8500 specifications: https://www.intel.com/content/www/us/en/products/sku/129939/intel-core-i58500-processor-9m-cache-up-to-4-10-ghz/specifications.html

Second check, 2026-11-20: 28 facts checked against the cited pages; 0 corrected; 1 couldn't be checked.
