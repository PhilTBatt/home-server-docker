# Dell OptiPlex 7070 Micro

Facts are for the **Micro**. Other 7070 form factors: see `dell-optiplex-7070-sff.md`.

Main source: "Dell OptiPlex 7070 Micro Setup and Specifications" (HTML topic pages) [S2]–[S9].

- **Form factor:** Micro. External power supply: only the distributor-hosted spec sheet copy says "external" ("90W external PSU (for 35W CPU)", "130W external PSU (for 65W CPU)"), and its text doesn't label which form factor those lines are for, so the Micro mapping is inferred [S11]. Dell's power-supply page says neither "external" nor "adapter" [S9] (corrected on a second check, 2026-11-20)
- **CPUs** [S2]:
  - 9th gen, 65 W: Core i3-9300, i3-9100, i5-9400, i5-9500, i5-9600, i7-9700, i9-9900
  - 9th gen, 35 W: i3-9300T, i3-9100T, i5-9400T, i5-9500T, i5-9600T, i7-9700T, i9-9900T
  - 8th gen, 65 W: i3-8100, i3-8300, i5-8400, i5-8500, i5-8600, i7-8700
  - 8th gen, 35 W: i3-8100T, i3-8300T, i5-8400T, i5-8500T, i5-8600T, i7-8700T
  - Note: "available offline only" [S2]
  - Socket: not stated [S2]. Intel lists the i5-9500T as "FCLGA1151", 35 W, ECC "No" [S12]
  - Max TDP: not stated. Highest listed is 65 W. "System with 65 W CPU is shipped with 130W PSU" [S9]
- **Chipset:** Intel Q370 [S3]
- **Memory** [S4]:
  - "2 SODIMM". "DDR4 DRAM Non-ECC memory"
  - Minimum 4 GB, maximum 32 GB, maximum 16 GB per slot. Options up to 2 x 16 GB
  - Speed: "2666 MHz memory will perform at 2400 MHz on i3 processors"
- **Built-in graphics** [S7]: Intel UHD Graphics 630, CPU dependency printed as "8th Generation Intel Core Processor i3, i5,i7". Outputs: DisplayPort, "HDMI 1.4 (optional)", "VGA (optional)". No listed CPU lacks graphics
- **Expansion slots:** no PCIe slot is listed [S6]. Spec sheet copy: "discrete graphics cards are not available on Micro" [S11]
- **Storage** [S5][S6]:
  - M.2: "1 - 2230/2280 (Support SATA & PCIe interface)"
  - SATA: "1 (Support Standard Rev 3.0)"
  - SSD: "M.2 2280/ 2.5 inch", SATA AHCI up to 6 Gbps or "PCIe 3 x4 NVME, Up to 32 Gbps", up to 2 TB
  - HDD: "2.5 inch" only. Optional Intel Optane 16 GB
- **Power supply** [S9]:
  - "Wattage": "90W / 130 W" (corrected on a second check, 2026-11-20: the page's rows are "Input Voltage", "Input current (maximum)" and "Wattage"; it does not say "adapter"). Input "100-240 Vac". Max input current printed as "1.7/1.8"
  - "NOTE System with 65 W CPU is shipped with 130W PSU"
  - Connector size: not stated in the 7070 Micro guide. The spec sheet copy says 90 W for 35 W CPU and 130 W for 65 W CPU [S11]
- **Networking** [S8]:
  - Wired: Intel i219-LM Gigabit Ethernet 10/100/1000 (Remote Wake Up, PXE, Intel AMT)
  - Wi-Fi options: Qualcomm QCA61x4A (2x2 802.11ac + BT 4.2), Intel Wireless-AC 9560 (2x2 802.11ac + BT 5)
  - Wi-Fi slot: "1 - 2230 (keyed to support Integrated or Discrete WiFi, Support Intel CNVi or USB2.0/PCIe)" [S6]. Key letter: not stated. Whether Wi-Fi was fitted by default: not stated
- **Upgrade notes stated by Dell:**
  - A 65 W CPU needs the 130 W PSU [S9] (corrected on a second check, 2026-11-20: Dell's page says "130W PSU", not "adapter")
  - RAM runs at 2400 MHz with i3 [S4]
  - Only one SATA connector and one M.2 SSD slot [S6]

Sources:
- [S1] Setup and Specifications (start page, from search): https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/ports-and-connectors
- [S2] Processor: https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/processor?guid=guid-b3b806ec-2a86-4886-83e4-67fd488d767f&lang=en-us
- [S3] Chipset: https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/chipset?guid=guid-30547629-0d54-478f-8113-5046ebcd599a&lang=en-us
- [S4] Memory: https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/memory?guid=guid-7a6c382e-c8af-4ab3-9b68-be050ee50eaa&lang=en-us
- [S5] Storage: https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/storage?guid=guid-4eab9a0b-c403-4bcd-b692-9419bddfed24&lang=en-us
- [S6] System board drive connectors: https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/system-board-drive-connectors?guid=guid-a828ebb5-0563-42e5-826a-ed9ee262d30b&lang=en-us
- [S7] Video: https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/video?guid=guid-b6f3a320-b139-4634-b5c7-56401abf2bfc&lang=en-us
- [S8] Communications: https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/communications?guid=guid-366f9f29-287e-4b3b-bdd2-d6881a7cd16f&lang=en-us
- [S9] Power supply: https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/power-supply?guid=guid-475c5c8b-0f34-45e9-a49f-b5ba4c3b27c3&lang=en-us
- [S10] Could not open: the PDF https://dl.dell.com/content/manual51595716-dell-optiplex-7070-micro-setup-and-specifications.pdf?language=en-us (robots_disallowed / proxy 403), and the ports topic https://www.dell.com/support/manuals/en-us/optiplex-7070-micro/opti7070_micro_setup_specs/ports-and-connectors?guid=guid-0cb86ac5-ad1f-4ce2-a67c-136de301f6ec&lang=en-us (fetch failed, client error)
- [S11] Dell "Features & Technical Specifications, OptiPlex 7070 Tower, Small Form Factor and Micro", hosted by a Dell distributor (Redington), not by Dell: https://redingtongroup.com/india/delltechnologies/files/optiplex_7070_spec_sheet.pdf
- [S12] Intel, Core i5-9500T specifications: https://www.intel.com/content/www/us/en/products/sku/191052/intel-core-i59500t-processor-9m-cache-up-to-3-70-ghz/specifications.html

Second check, 2026-11-20: 12 facts checked against the cited pages; 1 corrected; 0 couldn't be checked.
