# Dell PowerEdge T140

Facts are for the **PowerEdge T140 tower server**.

Sources used:
- Dell's HTML "Dell EMC PowerEdge T140 Technical Specifications" [S2]–[S9]
- Dell's "Installation and Service Manual" [S10]–[S12]
- Dell's "PowerEdge T140 Technical Guide", Rev. A03, Dec 2020 [S14]. I could only open a copy hosted on a third-party shop CDN (cdn.shopify.com), not on dell.com
- Dell's generation comparison matrix [S15] and French spec sheet [S16]

- **Form factor:** tower server, single socket ("Number of processors supported: One") [S2]
- **CPUs** [S2]:
  - "Intel Xeon processor E-2200 product family", "Intel Core i3 9100", "Intel Pentium G5420", "Intel Celeron G4930"
  - "Intel Xeon processor E-2100 product family", "Intel Core i3 8100", "Intel Pentium G5500", "Intel Celeron G4900"
  - Socket: not stated in the Technical Specifications [S2]. Technical Guide: "Socket H4, LGA1151" [S14]. Intel lists the Xeon E-2224 as "FCLGA1151" [S17]
  - Max TDP: not stated in the Technical Specifications. Technical Guide: 95 W (E-2286G, E-2186G) [S14]
- **Chipset:** "Intel C246 chipset" [S15]. The Technical Guide says the same [S14]
- **Memory:**
  - Technical Specifications [S3]:
    - UDIMM only: single or dual rank, 8 GB or 16 GB sticks. Max 64 GB (with 16 GB sticks). Four 288-pin sockets
    - Speed "2666 MT/s, 2400 MT/s, 2133 MT/s"
    - "NOTE 3200 MT/s UDIMM is compatible from BIOS version 2.5.1 but downshift to 2666 MT/s operational speed."
  - Service manual [S10][S11]:
    - Two channels: Channel 0 = A1, A3; Channel 1 = A2, A4
    - "first socket is marked white and the second socket black". Populate white tabs first; highest capacity first when mixing
    - "Mixing more than two capacities in one system is not supported" (as summarised by the fetch tool)
    - Mixed speeds run at the slowest. An odd number of DIMMs is allowed
  - ECC:
    - Not stated in the Technical Specifications or the service manual [S3][S10][S11]
    - Technical Guide: "Unbuffer (UDIMM) ECC DDR4 technology" [S14]
    - The fetch tool's translation of the French spec sheet mentions both UDIMM and "registered ECC" [S16]. That conflicts with every other source, which lists UDIMM only
    - Intel lists ECC "Yes" for the Xeon E-2224 [S17]. ECC with the listed Core i3 / Pentium / Celeron CPUs: not stated by Dell
- **Built-in graphics:** "Matrox G200eW3 graphics card with 16 MB capacity", up to 1280x1024 at 60/75 Hz [S9]. Rear VGA [S15]. Whether CPU graphics can be used: not stated
- **Expansion slots:**
  - Technical Specifications [S4]. Every slot is Gen3, "Full Height" and "Half Length":
    - Slot 1: processor, "x8 link in x8 slot"
    - Slot 2: processor, "x8 link in x16 slot"
    - Slot 3: PCH, "x1"
    - Slot 4: PCH, "x4 link in x8 slot"
    - Note: "The expansion cards are not hot swappable."
  - Board labels agree: "Slot 1: PCIE_G3_X8 CPU", "Slot 2: PCIE_G3_X8 CPU", "Slot 3: PCIE_G3_X1 PCH", "Slot 4: PCIE_G3_X4 PCH" [S12]
  - Technical Guide: max card 111.15 mm high x 167.65 mm long. It describes the slots the same way in one table, but differently in its summary [S14]
  - **Conflict:** the comparison matrix says "1 x Gen3 slot (1 x16)" and "2 x Gen3 slots (2 x8)" [S15]
- **Graphics card limits:** not stated. No PCIe graphics power cable is mentioned in any T140 source I read
- **Storage:**
  - "4 x 3.5-inch SAS, SATA drives" [S6]. The matrix and spec sheet describe the bays as cabled [S15][S16]
  - "NOTE: For a system with 4 TB (or more) drive capacity, PERC is required for thermal control." [S6]
  - Controllers [S7]: internal PERC H730P, PERC H330, HBA330; external "12 Gb/s Ext SAS HBA", HBA355e. Software RAID "S140" [S15][S16]
  - Board: "SATA 0-3" (a Mini SAS connector), "SATA_ODD/HDD 4" (optical drive connector), "HDD/ODD_POWER", "INT_USB_3.0" [S12]
  - M.2: no on-board M.2 is listed. The Boot Optimized Storage card (BOSS) takes 1 or 2 x 240 GB M.2 SSDs (RAID 1 or no RAID) and uses a PCIe slot [S14][S15]. The service manual's "M.2 SSD module" page body was empty [S13]
  - Optical drive: optional (service manual topic "Optional optical drive") [S13]
- **Power supply** [S5]:
  - "365 W AC", Gold, 100–240 V AC autoranging, 5 A. Cabled and non-redundant [S14][S15]
  - Board connectors: "PWR_SYSTEM 1" (system power connector P1) and "PWR_CPU 1" (processor power connector P2) [S12]. Pin counts: not stated
- **Networking:**
  - "up to two 10/100/1000 Mbps Network Interface Controller (NIC) ports" on the back panel [S8]. Comparison matrix: "2 x 1GbE LOM (standard)" [S15]
  - Technical Guide: Broadcom BCM5720 controller, plus "a dedicated iDRAC NIC port" (as summarised by the fetch tool) [S14]. Not confirmed by the Technical Specifications
  - Wi-Fi: not stated
- **Upgrade notes stated by Dell:**
  - 3200 MT/s UDIMMs need BIOS 2.5.1 or later and run at 2666 MT/s [S3][S10]
  - Use only UDIMM (8/16 GB listed). Max 64 GB [S3]
  - PERC is required for drives of 4 TB or more [S6]
  - Populate white sockets first, and use at most two different capacities [S10][S11]

Sources:
- [S1] Manuals list, PowerEdge T140: https://www.dell.com/support/product-details/en-us/product/poweredge-t140/resources/manuals
- [S2] TS, Processor specifications: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ts_pub/processor-specifications?guid=guid-7275c1be-ad45-411a-a86e-53f4adb43e93&lang=en-us
- [S3] TS, Memory specifications: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ts_pub/memory-specifications?guid=guid-6cef346c-776b-480a-8e17-4cf122e96259&lang=en-us
- [S4] TS, Expansion card specifications: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ts_pub/expansion-card-specifications?guid=guid-0af0c2fc-284b-4fd7-aa15-cd621a11fa35&lang=en-us
- [S5] TS, PSU specifications: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ts_pub/psu-specifications?guid=guid-e5b67521-5ffa-4315-9d74-96d253513e40&lang=en-us
- [S6] TS, Drives: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ts_pub/drives?guid=guid-82a5b003-4f49-494e-8322-5eb1c1f14704&lang=en-us
- [S7] TS, Storage controller specifications: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ts_pub/storage-controller-specifications?guid=guid-f74c619b-e999-4d4a-a21e-26a8fb68e840&lang=en-us
- [S8] TS, NIC ports specifications: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ts_pub/nic-ports-specifications?guid=guid-853bb332-3a3b-46d4-8ac0-8ecce07fa0fd&lang=en-us
- [S9] TS, Video specifications: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ts_pub/video-specifications?guid=guid-5c341e4c-c6a0-43b6-8c18-2e54965f7b8f&lang=en-us
- [S10] Service manual, System memory guidelines: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ism_pub/system-memory-guidelines?guid=guid-bddd0e3b-777b-491d-b4c9-f5b68d60b374&lang=en-us
- [S11] Service manual, General memory module installation guidelines: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ism_pub/general-memory-module-installation-guidelines?guid=guid-acbc0f13-dedb-492b-a0b0-18303ded565a&lang=en-us
- [S12] Service manual, System board jumpers and connectors: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ism_pub/system-board-jumpers-and-connectors?guid=guid-f8fe205d-d9f4-4cf7-a0a3-04980e240e0c&lang=en-us
- [S13] Service manual topics with no usable body text: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ism_pub/m2-ssd-module?guid=guid-06c7db70-26e8-4f17-b25e-875c4e9e4616&lang=en-us . The optional optical drive topic was listed in the TOC but not opened: https://www.dell.com/support/manuals/en-us/poweredge-t140/pet140_ism_pub/optional-optical-drive?guid=guid-7192a152-7943-45d4-8ea4-e6f519999c70&lang=en-us . The TS and ISM PDFs could not be opened (robots_disallowed / proxy 403): https://dl.dell.com/content/manual57458386-dell-emc-poweredge-t140-technical-specifications.pdf?language=en-us and https://dl.dell.com/content/manual56449207-dell-emc-poweredge-t140-installation-and-service-manual.pdf?language=en-us
- [S14] "Dell EMC PowerEdge T140 Technical Guide", Rev. A03, Dec 2020. Dell document, but read from a third-party copy on a shop CDN: https://cdn.shopify.com/s/files/1/0248/8539/5502/files/poweredge-t140-tech-guide.pdf
- [S15] Dell "server generation comparison matrix" T140: https://i.dell.com/sites/csdocuments/product_docs/en/server-generation-comparison-matrix-t140.pdf
- [S16] Dell PowerEdge T140 spec sheet, French edition (translated by the fetch tool): https://i.dell.com/sites/csdocuments/Product_Docs/fr/poweredge-t140-spec-sheet-fr-fr.pdf
- [S17] Intel, Xeon E-2224 specifications: https://www.intel.com/content/www/us/en/products/sku/191036/intel-xeon-e2224-processor-8m-cache-3-40-ghz/specifications.html

Second check, 2026-11-20: 22 facts checked against the cited pages; 0 corrected; 3 couldn't be checked.
