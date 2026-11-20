# Fujitsu Esprimo D958

Facts are for the **ESPRIMO D958 desktop ("10 l housing")**. The sheet doesn't call it SFF, and says the unit can operate horizontally or vertically (feet needed for vertical) [S1]. The Fujitsu data sheet covers two variants: **ESPRIMO D958/E85+** and **ESPRIMO D958/E94+** [S1].
- "D958/E94" without the "+" does not appear on the sheet I read. I can't confirm whether it is a separate variant or the same thing written without the "+".
- The only differences between the variants are: CPU list (E94+ adds i5-9500, i5-9600, i7-9700), PSU (210W vs 280W), noise figures, a switched monitor outlet and "Extended lifetime" on E94+ [S1]

Source note: Fujitsu's own data-sheet URLs now redirect to global.fujitsu [S2], and archive.org was blocked here. The data sheet was read from a copy hosted on Moldova's public-procurement portal [S1]. It is Fujitsu Technology Solutions' "Data Sheet FUJITSU Desktop ESPRIMO D958", footer "2019-11-01 EM-EN".

- **Form factor:** 332 x 338 x 89 mm; the case is described as "10 l housing, more I/O slots" in the Expandability section. The sheet's "Formfactor proprietary" is in the Mainboard section, so it describes the board, not the case (corrected on a second check, 2026-11-20) [S1]
- **Mainboard:** D3632, "Formfactor proprietary" (the board's form factor) (corrected on a second check, 2026-11-20), Intel Q370, LGA 1151, one CPU [S1]
- **CPUs:**
  - D958/E85+: i3-8100, i3-9100, i5-8500, i5-8600, i7-8700 [S1]
  - D958/E94+: i3-8100, i3-9100, i5-8500, i5-8600, i5-9500, i5-9600, i7-8700, i7-9700 [S1]
  - No Pentium, Celeron, i9 or Xeon is listed [S1]
  - TDP: not stated
- **Memory:** "4 DIMM (DDR4)"; max "64 GB" [S1]
  - Module options: "4 GB / 8 GB / 16 GB (1 module(s)) DDR4, unbuffered, non-ECC, 2,666 MT/s, UDIMM" [S1]
  - "For dual channel performance, 2 memory modules have to be ordered. Capacity per channel has to be the same." [S1]
  - "2666 MHz may be clocked down to 2400 MHz depending on processor and memory configuration" [S1]
  - ECC: not stated. The sheet lists only unbuffered, non-ECC UDIMM modules and doesn't say whether ECC works [S1]
- **Built-in graphics:** "Intel UHD Graphics 610, Intel UHD Graphics 630", shared memory "Up to half size of total system memory" [S1]. Only two CPU rows, the i3-9100 and the i7-9700, say "Intel HD Graphics 630"; the other CPU rows say "Intel UHD Graphics 630" (inconsistent wording on the sheet) (corrected on a second check, 2026-11-20) [S1]
  - Discrete option: "NVIDIA Quadro P400, 2 GB, PCIe x16, 3 x miniDP" [S1]
- **Expansion slots** [S1]:
  - "PCI-Express 3.0 x1 2 x (174 mm / 6.85 inch) Low profile"
  - "PCI-Express 3.0 x4 (mech. x16) 1 x (174 mm / 6.85 inch)". Height is not stated on this row
  - "PCI-Express 3.0 x16 1 x (174 mm / 6.85 inch) Low profile"
  - Graphics card max power and PCIe power cable: not stated [S1]
- **Storage:**
  - M.2: "M.2-2280 on mainboard" for NVMe SSD (PCIe 3.0 x4), Intel Optane supported, plus "M.2-2230 on mainboard for WLAN module" [S1]
  - M.2 SATA: not stated
  - SATA: "Serial ATA total 5", "thereof SATA III 5" [S1]
  - eSATA: the mainboard table says "thereof eSATA 2", but the interface table says "eSATA 1 (optional)" [S1]
  - RAID 0/1/5/10 [S1]
  - Bays: "3.5-inch internal bays 1", "3.5-inch external bays 1", "5.25-inch external bays 1" (for a slim ODD) [S1]
  - Bay notes: "internal 3.5" bay: 1x 3.5" drive (screwless) or 1x 2.5" drive (screws)"; "optional via adapter for 1x or 2x 2.5" drives (screwless)" [S1]
- **Power supply:** 100-240V [S1]. No 80 PLUS label is given [S1]. Connector type and proprietary status: not stated
  - E85+: "Max. output of single power supply 210 W", efficiency 80/85/88/87% at 10/20/50/100% load (230V) [S1]
  - E94+: 280 W, efficiency 87/91/94/93% [S1]
- **Networking:** Intel I219LM, 10/100/1000 [S1]
  - Wi-Fi is optional: "M.2 WLAN 802.11ac (2x2) and BT 5 (dedicated regions only)" in the M.2-2230 WLAN slot (key not stated) [S1]
- **Upgrader trip-ups stated in the doc:**
  - CSM (legacy boot) is "no longer possible" on 8th-gen Core systems, so it's UEFI only [S1]
  - vPro / iAMT 12.0 depends on the CPU [S1]
  - Matched modules are needed per channel for dual channel [S1]
  - RAM may clock down to 2400 [S1]
  - BIOS version needed for 9th-gen CPUs: not stated

Sources:
- [S1] Fujitsu data sheet "FUJITSU Desktop ESPRIMO D958" (2019-11-01 EM-EN), third-party-hosted copy: https://storage.mtender.gov.md/get/f7295f3f-c091-4fb1-872a-6b8ba231f3ff-1574452908288
- [S2] Original Fujitsu URL (now redirects to https://global.fujitsu/en-global; could not open): https://www.fujitsu.com/fts/Images/ds_ESPRIMO_D958.pdf

Second check, 2026-11-20: 23 facts checked against the cited pages; 2 corrected; 2 couldn't be checked.
