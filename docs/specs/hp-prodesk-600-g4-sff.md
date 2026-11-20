# HP ProDesk 600 G4 SFF

- **Form factors under this name:** Microtower, SFF and Desktop Mini, all in one QuickSpecs (c06043924, not opened, see below). **The facts below are for the SFF**, from HP's support spec page for the SFF.
- **CPU:**
  - Chipset "Intel Q370" ([SP], [DS]).
  - CPUs listed with their wattage ([SP]):
    - i7-8700, i5-8600, i5-8500 and i3-8100: 65 W.
    - i3-8300: 62 W.
    - Pentium Gold G5600/G5500/G5400: 54 W.
    - Celeron G4900: 54 W.
  - No K CPUs are listed. Max TDP is not stated as a rule.
  - Socket: not stated (LGA1151, from memory, unchecked).
- **Memory:**
  - "DDR4-2666", "Maximum: 64 GB", "(4) DIMM (slots are customer accessible/upgradeable)". Configurations go up to "64 GB (16 GB x 4)" ([SP]).
  - **Speed is limited by the CPU:** "actual data rate is determined by the system configured processor". The processor entries list "DDR4 memory up to 2400 MT/s data rate" for the i3-8300, i3-8100, Pentium Gold G5600/G5500/G5400 and Celeron G4900. The i7/i5 parts are "up to 2666 MT/s" ([SP]).
  - The datasheet has a footnote "Memory modules support data transfer rates up to 2133 MT/s", which conflicts with its own 2666 figure ([DS]).
  - ECC: not stated.
- **Built-in graphics:** UHD 630 (Core, and Pentium G5600/G5500); UHD 610 (Pentium G5400, Celeron G4900) ([SP]).
- **Expansion slots:**
  - "(1) PCI Express x16", "(1) PCI Express x4" ([SP]). The datasheet says "1 PCIe 3 x4; 1 PCIe 3 x16" ([DS]).
  - Slot height: the page "does not mention low profile". The optional cards are the AMD Radeon R7 430 2 GB (2×DP, or DP+VGA) ([SP]).
  - Max card power/length: not stated. PCIe power cable: not stated.
- **Storage:**
  - "(1) M.2 PCIe x4 2280/2230 Combo (for storage)" and "(1) M.2 PCIe x1 2230 (for WLAN)" ([SP]). Only PCIe NVMe M.2 SSDs are listed; M.2 SATA is not stated.
  - "(3) SATA ports" ([SP]).
  - Bays, wording differs:
    - Support page: "(2) 6.35 cm (2.5 in)" + "(1) 8.89 cm (3.5 in)" internal, "(1)" slim ODD and an SD reader ([SP]).
    - Datasheet: "One 3.5" HDD; Two 2.5" HDD" ([DS]).
    - The 600 G5 SFF QuickSpecs words its (similar) bays as 3.5" **or** two 2.5". For the G4, the datasheet's footnote 17 says "SFF can be configured with either (1) 3.5” or (2) 2.5” internal storage drive (2.5 inch drive needs adapter)", so it is one or the other, not both ([DS]) (corrected on a second check, 2026-11-20).
- **Power supply:**
  - "180 W active PFC, 80 PLUS Platinum", 90/92/89 % at 20/50/100 % load (115 V), 50 mm fan, DC output "12 V" ([SP]).
  - The datasheet says "180 W internal power supply, up to 92% efficiency, active PFC" ([DS]).
  - Proprietary connector: not stated (only "DC output 12 V" is given).
- **Networking:**
  - Intel I219-LM GbE standard. Optional Intel I210-T1 PCIe x1 NIC ([SP]).
  - Wi-Fi options: "Intel 9560 802.11ac 2x2 … vPro" and "non-vPro", "Realtek RTL8821BE 802.11ac 2x2", "Realtek RTL8723CE 802.11ac 1x1" ([SP]). The datasheet instead names "Realtek RTL8822BE-CG" ([DS]).
  - Wi-Fi goes on the M.2 2230 WLAN slot. M.2 key: not stated.
- **Upgrade trip-ups the docs state:** i3/Pentium/Celeron cap memory at 2400 MT/s. The PSU is a 180 W unit.

<a id="600g4-sources"></a>Sources:
- [SP] HP Support spec page "HP ProDesk 600 G4 Small Form Factor Business PC" (document c06055178): https://support.hp.com/in-en/document/c06055178
- [DS] HP datasheet "HP ProDesk 600 G4 Small Form Factor PC", 4AA7-3014ENUC, 11/13/2018: https://bargainhardware.co.uk/media/quick-specs/desktops/HP-ProDesk-600-G4-SFF-Quick-Specs.pdf
- Not opened: QuickSpecs c06043924. The HP host was refused, and the mirror https://maytinhcdc.vn/media/lib/prodesk600g4.pdf failed to load.

Second check, 2026-11-20: 14 facts checked against the cited pages; 1 corrected; 1 couldn't be checked.
