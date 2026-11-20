# Lenovo ThinkStation P330 SFF (Gen 1)

Facts are for the **P330 SFF, first generation**.

- **Form factor:** "8.4L mini-tower", 343.5 H x 92.5 W x 305.6 D mm [S1]
- **CPUs** [S1]:
  - "Up to one Intel Xeon E-2100 family processor, up to 80W, up to 6 cores at 3.7GHz"
  - "Or up to one 8th Intel Core family processor, i7, i5, or i3, up to 65W"
  - "Or up to one Intel Pentium G5400 via Special Bids, 58W"
  - Max TDP as stated: Xeon 80W, Core 65W
  - Socket: not stated [S1]. Intel lists the E-2176G (80 W) as FCLGA1151 [S3]
- **Chipset:** Intel C246 [S1]
- **Memory:** 4 DIMM sockets, DDR4-2666 UDIMM; "Up to 64GB with 4x 16GB, both ECC and non-ECC" [S1]
  - "Memory protection ECC with ECC UDIMM. Core i7 and i5 processors cannot support ECC UDIMM" [S1]
  - "ECC and non-ECC are supported, but memory types cannot be intermixed" [S1]
- **Built-in graphics:** UHD 630 on Core, UHD P630 on -G Xeons, UHD 610 on the Pentium G5400. No processor graphics are listed for non-G Xeons [S1]
  - DP/HDMI need a Core, Pentium or -G Xeon [S1]
- **Expansion slots: sources disagree on height.**
  - This PSREF says: "Slot 1 PCIe 3.0 x16, full height, half length, links to CPU"; "Slot 2 PCIe 3.0 x1, full height, full length, links to PCH"; "Slot 3 PCIe 3.0 x16 (negotiable link width x4), full height, half length, links to PCH" [S1]
  - The PSREF for the **P330 SFF Gen 2** (same 8.4L size) says all three slots are "low profile" [S2]
  - A spec sheet titled "P330 SFF G1" on thinkstation-specs.com [S4] also says "Full Height, Full Length". It gives different slot types (Slot 2 "PCIe 2.0 x1", Slot 3 "PCIe 3.0 x4"), lists 9th-gen/E-2200 CPUs, and describes its graphics cards as "Single Slot, Low Profile". I couldn't confirm that site is Lenovo's, and its content looks mixed with Gen 2, so I give it low trust
  - That sheet also gives slot power figures: Slot 1 45W, Slot 2 25W, Slot 3 75W [S4]. The PSREF slot lines quoted above [S1] give no wattage, so the two sources don't match on this either
  - (from memory, unchecked) A 92.5 mm-wide SFF chassis would normally take only low-profile cards.
  - **Unresolved:** the Gen 1 PSREF says full height [S1]; the Gen 2 PSREF says low profile [S2]; Lenovo's P330 SFF Hardware Maintenance Manual (machine types 30C7, 30C8, 30CA) names the slots but doesn't state a height [S5]. No maker source settles it, so treat the slot height as unknown
- **Graphics cards:** "Up to two PCIe 3.0 x16 slots for discrete graphics adapter (Slot 1 and 3)" [S1]
  - Options: Quadro P400 30W, P620 40W, P1000 47W, max 2 of each [S1]
  - PSU requirement, aux power connector and max length: not stated [S1]
- **Storage:**
  - SATA: four onboard 6Gb/s ports, max four SATA devices, RAID 0/1 [S1]
  - Bays: Bay 1 primary 3.5" SATA; Bay 2 2.5" SATA (optional); Bay 3 9 mm slim ODD [S1]
  - M.2: one onboard slot plus up to two PCIe-to-M.2 adapters in slot 1 or 3; PCIe 3.0 x4 NVMe up to 1TB each [S1]
  - M.2 RAID needs the onboard slot plus slot 3 [S1]
  - Optane: 32GB, one per system, not on Pentium G5400 [S1]
  - M.2 length: not stated
- **Power supply:** 210W (85%, 80 PLUS Bronze) or 260W (92%, 80 PLUS Platinum) [S1]. Aux GPU connector: not stated
- **Networking:** Intel i219LM GbE with Wake-on-LAN. Optional PCIe Ethernet adapters [S1]
  - Wi-Fi is optional: "One dedicated onboard M.2 slot for optional Intel Wireless-AC 9560" [S1]
- **Upgrader trip-ups stated in the doc:** same ECC and video-output rules as the Tower [S1]

Sources:
- [S1] PSREF ThinkStation P330 SFF spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkStation/ThinkStation_P330_SFF/ThinkStation_P330_SFF_Spec.PDF
- [S2] PSREF ThinkStation P330 SFF Gen 2 spec: https://psref.lenovo.com/syspool/Sys/PDF/ThinkStation/ThinkStation_P330_SFF_Gen_2/ThinkStation_P330_SFF_Gen_2_Spec.PDF
- [S3] Intel Xeon E-2176G specifications: https://www.intel.com/content/www/us/en/products/sku/134860/intel-xeon-e2176g-processor-12m-cache-up-to-4-70-ghz/specifications.html
- [S4] thinkstation-specs.com "P330 SFF G1" sheet (Version 1, 10/29/2019; ownership not confirmed): https://thinkstation-specs.com/wp-content/uploads/2019/09/P330-SFF-G1.pdf
- [S5] Lenovo P330 SFF Hardware Maintenance Manual (machine types 30C7, 30C8, 30CA; read on the second check, 2026-11-20): https://download.lenovo.com/pccbbs/thinkcentre_pdf/p330_sff_hmm.pdf

Second check, 2026-11-20: 16 facts checked against the cited pages; 0 corrected; 1 couldn't be checked.
