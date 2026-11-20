# HP EliteDesk 800 G4 SFF

- **Form factors under this name:** Tower, SFF and Desktop Mini (35 W, 65 W and 95 W variants), plus the EliteOne 800 G4 AiO, all in one QuickSpecs. A separate "EliteDesk 800 G4 Workstation Edition" tower also exists (seen in search-result titles only). **The facts below are for the SFF.**
- **CPU:**
  - Chipset "Intel® Q370" ([DS]).
  - "Processors up to 95W on TWR, SFF and DM" ([QS]).
  - The SFF datasheet lists 8th-gen Core including the "i7-8700K" and "i5-8600K", plus Pentium Gold G5400/G5500 ([DS]). The marketing text says "optional 95W processors" ([DS]).
  - The service guide's parts list has separate fan sinks: "for use in models with a 95 W processor" and "for use with processors up to 65 W" ([MSG]). A 95 W CPU therefore needs the 95 W fan sink. This is inferred from the parts list; the guide does not state it as a rule.
  - Socket: not stated (LGA1151 for 8th/9th gen, which does not take 6th/7th-gen CPUs; from memory, unchecked).
- **Memory:**
  - "64 GB DDR4-2666 SDRAM", "4 DIMM" ([DS]).
  - Service guide: four sockets, "two sockets per channel", "up to 64 GB", "non-ECC memory technologies", "Memory modules constructed with x4 SDRAM are not supported" ([MSG]).
  - Speeds in the service guide disagree with each other: its spec text says "PC4-19200 DDR4-2400" while its parts list says "UDIMM, non-ECC, 1.2v, PC4-2666" ([MSG]). The datasheet and QuickSpecs say up to 2666 MT/s, "actual data rate is determined by the system's configured processor" ([DS], [QS]).
  - The QuickSpecs lists a "128 GB (4 x 32GB)" configuration that appears to sit in the Tower column only (column unclear) ([QS]).
  - The datasheet also has a footnote reading "Memory modules support data transfer rates up to 2133 MT/s". This contradicts its own 2666 figure and is reported as extracted ([DS]).
  - ECC: non-ECC only per the service guide ([MSG]).
- **Built-in graphics:** UHD 630, and UHD 610 on the Pentium G5400 and Celeron G4900 ([DS], [QS]). No CPU without graphics is listed.
- **Expansion slots:**
  - Service guide: "The PCI Express sockets support only low profile cards." Sockets: X16PCIEXP (x16), X4PCIEXP ("x16 downshifted to a x4"), X1PCIEXP1 and X1PCIEXP2 ([MSG]).
  - Datasheet: "1 PCIe 3.0 x16", "1 PCIe 3.0 x16 (wired as x4)", "2 PCIe 3.0 x1" ([DS]).
  - QuickSpecs: x1 = 2, x16 wired x4 = 1, x16 = 1 ([QS]).
  - Graphics cards in the SFF datasheet: GT 730 2 GB, Radeon R7 430 2 GB, Quadro P400 2 GB ([DS]).
  - QuickSpecs SFF graphics pages list cards as "LP PCB with FH/LP bracket", with power of "<50W" (R7 430) and "35 W" (GT730) ([QS]).
  - "For dual graphics card configurations, the first (primary) card must be installed in the PCI Express x16 socket that is NOT downshifted to a x4" ([MSG]).
  - Max graphics power or length for the SFF: not stated. PCIe power cable: not stated.
  - The service guide's parts list labels its graphics cards "full-height, PCIe x16", which conflicts with its own low-profile-only statement ([MSG]).
- **Storage:**
  - M.2: two storage sockets SSD1/SSD2 "M.2 2280" and one "M.2 2230" WLAN socket ([MSG]). QuickSpecs: "M.2 PCIe x4 2280/2230 Combo (for storage)" ×2 and "M.2 PCIe x1 2230 (for WLAN)" ×1 ([QS]).
  - M.2 SATA support: not stated.
  - Bays: "(1) 2.5" internal storage drive bay", "(2) 3.5” internal storage drive bay (convertible to 2.5”)" and "(1) 9.5 mm slim optical drive bay" ([QS]). The datasheet says "1 slim ODD; One 2.5" HDD; Two 3.5" HDD" ([DS]).
  - SATA: "Internal SATA storage connector(s) N/A 3 4 2" under the headers DM SFF TWR AiO, so the SFF has 3 ([QS]). The service guide names SATA0 (primary), SATA1 and SATA2 ([MSG]).
  - QuickSpecs note (form factor not clearly tied in the extracted text): "SATA 2.5” internal storage drive cannot be selected if 2nd M.2, discrete graphic card, or 95W processor is selected" ([QS]).
- **Power supply:**
  - "250 W internal power supply, up to 92% efficiency, active PFC" ([DS]).
  - Service guide parts list: "Power supply, 250W" ([MSG]).
  - QuickSpecs PSU table: "250W active PFC / 80 PLUS Platinum" is present, but the column is unclear ([QS]).
  - Proprietary connector: not stated.
- **Networking:**
  - Intel I219-LM GbE LOM standard. Optional Intel I210-T1 PCIe NIC ([DS], [QS]).
  - Wi-Fi optional on the M.2 2230 slot: Intel 9560 (vPro and non-vPro), Realtek RTL8822BE/RTL8821CE ([QS], [DS]).
  - Datasheet: "Wireless LAN is optional and must be bought at purchase" ([DS]).
  - M.2 key: not stated.
- **Upgrade trip-ups the docs state:**
  - Low-profile cards only.
  - The primary graphics card goes in the full x16 slot.
  - A 95 W CPU uses a different fan sink.
  - The 2.5" drive is not selectable alongside a 2nd M.2, a discrete GPU or a 95 W CPU (as a factory configuration rule).

<a id="800g4-sources"></a>Sources:
- [QS] HP QuickSpecs "HP EliteDesk 800 G4 and HP EliteOne 800 G4 Business Desktops PCs", footer "c06040430 – DA16286 – Worldwide", Version 36, February 18, 2020. The copy on HP's own community host: https://h30434.www3.hp.com/psg/attachments/psg/Business-PC-Workstation-POS/52518/1/HP%20EliteDesk%20800%20G4%20DM%20etc%20QuickSpecs%20v20.pdf (the filename says v20 but the footer says Version 36).
- [DS] HP datasheet "HP EliteDesk 800 G4 Small Form Factor PC", 4AA7-3267ENUC, April 2019: https://cdn.blueally.com/itsmartbuys/datasheets/workstation/elitedesk-800-g4-sff.pdf
- [MSG] HP "Maintenance and Service Guide, HP EliteDesk 800 G4 SFF Business PC", L17285-001, First Edition May 2018: https://h10032.www1.hp.com/ctg/Manual/c06472102.pdf

Second check, 2026-11-20: 25 facts checked against the cited pages; 0 corrected; 1 couldn't be checked.
