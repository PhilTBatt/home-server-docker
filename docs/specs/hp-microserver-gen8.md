# HP ProLiant MicroServer Gen8

- **Form factor:** "Ultra Micro Tower". **The facts below are for that.**
- **CPU:**
  - Chipset "Intel C204" ([QS]).
  - Processors listed ([QS]):
    - Celeron G1610T: 2.3 GHz, 2 cores, 35 W.
    - Pentium G2020T: 2.5 GHz, 2 cores, 35 W.
    - Core i3-3240: 3.4 GHz, 2 cores.
    - Xeon E3-1220Lv2: 2.3 GHz, 2 cores, 17 W.
  - **Two statements disagree on the i3-3240 TDP:** "(3.4GHz/2-core/3MB/65W)" in Standard Features and "(3.4GHz/2-core/3MB/55W)" in Pre-configured Models ([QS]).
  - Socket, max TDP and CPU upgrades: not stated (LGA1155, from memory, unchecked).
  - Celeron and Pentium give PCIe 2.0; Xeon gives PCIe 3.0 ([QS]).
- **Memory:**
  - "DDR3 Unbuffered (UDIMM)", "Memory Protection ECC" ([QS]). Whether non-ECC or registered DIMMs work is not stated.
  - 2 slots, 16 GB max (2 × 8 GB) ([QS]).
  - Speed by CPU: G1610T and G2020T "support up to 1333MHz DDR3 memory speed". The i3-3240 and E3-1220Lv2 support up to 1600 MHz ([QS]).
- **Built-in graphics:** "Integrated Matrox G200 video standard" (up to 1920×1200 at 16 bpp). There is one rear video connector; VGA is not named explicitly ([QS]).
- **Expansion slots:** one slot, "PCIe 3.0/2.0* x16 x16 Low Profile" (the generation depends on the CPU) ([QS]). Length, max power and GPU guidance: not stated.
- **Storage:**
  - Four non-hot-plug 3.5" (LFF) SATA bays in a 4-LFF cage ([QS]).
  - HPE Dynamic Smart Array B120i (RAID 0/1/10), listed with "5 internal connectors with non-hot-plug support" ([QS]).
  - Bays 1–2 run 6 Gb/s and bays 3–4 run 3 Gb/s ([QS]).
  - Optional SATA DVD-RW optical drive. Whether it uses one of the 5 connectors is not stated ([QS]).
  - Internal USB 2.0 port and microSD slot ([QS]).
  - No M.2 (inference, not stated: the QuickSpecs does not list M.2).
- **Power supply:**
  - "One (1) 150 Watts Non-Hot Plug, Non redundant Power Supply (AMS, APJ and PRC models)" ([QS]).
  - "One (1) 200 Watts Non-Hot Plug, Non redundant Power Supply (EMEA models)" ([QS]).
  - Efficiency and connector type: not stated.
- **Networking:**
  - HP Ethernet 1Gb 2-port 332i (two RJ-45). iLO 4 on a dedicated 1 Gb port, with the option to share port 1 ([QS]).
  - Wi-Fi: not stated.
- **Upgrade trip-ups the docs state:**
  - Memory is ECC UDIMM, max 16 GB.
  - Celeron/Pentium cap memory at 1333 and the slot at PCIe 2.0.
  - Drive bays 3–4 are 3 Gb/s.
  - The single PCIe slot is low profile.

<a id="gen8-sources"></a>Sources:
- [QS] HPE QuickSpecs "HPE ProLiant MicroServer Generation 8 (Gen8)", footer "c04123182 - 14565 - Worldwide - V26 - 23-October-2017" (marked retired): https://support.hpe.com/hpesc/public/api/document/c04123182?v=1774872120000

Second check, 2026-11-20: 12 facts checked against the cited pages; 0 corrected; 0 couldn't be checked.
