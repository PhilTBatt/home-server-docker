# HPE ProLiant MicroServer Gen10 Plus

- **Form factors under this name:** "Ultra Micro Tower", which "can be placed flat or vertically" ([QS]). A different model, the **MicroServer Gen10 Plus v2**, has its own QuickSpecs (a50004293enw, seen as a search-result title only; not researched). Do not mix the two. **The facts below are for the original Gen10 Plus.**
- **CPU:**
  - Chipset "Intel® C242 Chipset" ([QS]).
  - Xeon E-2224: 4 cores, 3.4 GHz, 71 W, memory 2666 MT/s ([QS]).
  - Pentium G5420: 2 cores, 3.8 GHz, 54 W, memory 2400 MT/s ([QS]).
  - Socket, max TDP and CPU upgrades: not stated (LGA1151, from memory, unchecked).
- **Memory:**
  - DDR4 UDIMM, ECC only: "No support for non-ECC UDIMMs". RDIMM and LRDIMM are not supported ([QS]).
  - 2 slots, 32 GB max (2 × 16 GB), 16 GB per DIMM max ([QS]).
  - "With G5420 processor, memory speed supports up to 2400 MT/s" ([QS]).
- **Built-in graphics:** the rear VGA and DisplayPort 1.1a come from the iLO 5 chipset's embedded video controller. It "does not support dual display or screen extension mode" ([QS]). The CPU's own iGPU: not stated.
- **Expansion slots:** one PCIe 3.0 x16 low-profile slot, "Supported on the PCIe Riser Board" ([QS]). Length, max power and GPU guidance: not stated.
- **Storage:**
  - Four non-hot-plug 3.5" (LFF) SATA bays ([QS]).
  - Embedded HPE Smart Array S100i SR Gen10 software RAID: UEFI mode, Windows only ([QS]). The doc mentions a separate open-source two-disk RAID 1 boot option for Linux.
  - Optional HPE Smart Array E208i-p ([QS]).
  - Boot option: HPE 32GB microSD RAID 1 USB Boot Drive (P21868-B21) ([QS]).
  - QuickSpecs "max internal capacity" is stated as 16 TB HDD (4 × 4 TB) or 960 GB SSD (4 × 240 GB). The doc says this follows the supported option list: "The maximum storage indicated is aligned with the current HDD & SSD option list supported. Maximum internal storage supported would change with the server’s option support plan." ([QS]) (corrected on a second check, 2026-11-20).
  - SATA port count and M.2: not stated.
  - USB: 2 front USB 3.2 Gen2, 4 rear USB 3.2 Gen1, 1 internal USB 2.0 ([QS]).
- **Power supply:** one 180 W non-redundant **external** power adapter ([QS]). Efficiency: not stated.
- **Networking:**
  - Embedded Intel i350-AM4, four 1 GbE RJ-45 ports ([QS]).
  - Remote management needs the "MicroServer Gen10 Plus iLO Enablement Kit (P13788-B21)", which adds a dedicated iLO port. Without it the server "does not support remote management/ out-of-band management by default" ([QS]).
  - Wi-Fi: not stated.
- **Upgrade trip-ups the docs state:**
  - ECC UDIMM only, max 32 GB.
  - Pentium caps memory at 2400.
  - S100i RAID is Windows-only.
  - iLO needs the add-on kit.
  - The single low-profile slot is on a riser.
  - Power comes from an external 180 W adapter.

<a id="gen10p-sources"></a>Sources:
- [QS] HPE QuickSpecs "HPE ProLiant MicroServer Gen10 Plus", footer "a00073554enw - 16502 - Worldwide - V13 - 18-August-2025" (marked "RETIRED"): https://support.hpe.com/hpesc/public/api/document/a00073554enw
- Gen10 Plus v2 QuickSpecs, title seen in search results only and not opened: https://support.hpe.com/hpesc/public/api/document/a50004293enw

Second check, 2026-11-20: 15 facts checked against the cited pages; 1 corrected; 0 couldn't be checked.
