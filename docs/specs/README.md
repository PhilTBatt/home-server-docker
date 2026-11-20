# Spec reference for the deal skills

One file for each PC, workstation and small server the deal watcher's catalogue searches for, with what its maker's documents say about it: CPUs and socket, memory, built-in graphics, expansion slots and graphics card limits, storage, power supply, networking, and anything an upgrader trips on. The `pc-build` and `deal-check` skills read a machine's file to check whether used parts fit it, instead of opening the maker's site, many of whose spec pages refused automated reads in November 2026.

## How it was made
- **Gathered 19 and 20 November 2026** by Claude research agents, one for each maker, from the makers' own documents: Dell's setup and specifications guides and spec sheets, HP's QuickSpecs, datasheets and service guides, HPE's QuickSpecs, Lenovo's PSREF sheets and a Fujitsu data sheet, plus Intel's processor pages for CPU sockets.
- **Read through a web-fetch tool** that turns a page into text and answers questions about it. No PDF was read directly: this environment's proxy refused direct downloads, and some makers' hosts refused the fetch tool too, so some documents were read from copies on other sites. Each file names the host and, for HP, the document number and version.
- **Checked a second time on 20 November 2026** by a separate set of agents that hadn't seen the research being done. They opened the cited pages again and checked the facts that matter most for fit (memory type, slots, maximum and ECC; slot heights; power supply; M.2; CPUs) and every conflict the files mark. The checkers went through about 630 lines (many hold several facts from one table row) and found 14 wrong: those are corrected and marked "(corrected on a second check, 2026-11-20)". Missed conflicts and readings presented as facts were marked too. Each machine's file ends with that machine's counts. The checkers' own notes are kept outside the repo.

## How far to trust a fact
- Every fact names the document it came from. Text in quotes is as the fetch tool returned it, which isn't always word for word.
- **"not stated"** means the documents read don't say it, not that the feature is missing.
- **"(from memory, unchecked)"** isn't from any document. Don't count it as checked.
- **"(column inferred)"** (HP): QuickSpecs print several form factors side by side, and which column a value belongs to had to be worked out.
- **"(inference, not stated)"**, "(inference)" and similar are the researcher's reading, not the maker's words. So are "(column unclear)", "(writer's advice, not from a source)" and "(checker's arithmetic)".
- Only a fact given as the maker's own words or figures, with its source, is settled.
- Where sources disagree, both are given. A fact given as a conflict isn't settled.
- **CPU sockets** for most of the Dell, HP and Lenovo office models come from Intel's page for one sample CPU from the maker's list, not from the PC maker. The same socket name doesn't make a CPU fit: the board's chipset and BIOS decide which generations work.
- Makers revise documents. These are the versions read in November 2026.

## Which file covers which machine

| Machine | File | Catalogue search |
|---|---|---|
| Dell OptiPlex 5070 SFF | [dell-optiplex-5070-sff.md](dell-optiplex-5070-sff.md) | `optiplex-5070-sff` |
| Dell OptiPlex 7060 SFF | [dell-optiplex-7060-sff.md](dell-optiplex-7060-sff.md) | `optiplex-7060-sff` |
| Dell OptiPlex 7070 SFF | [dell-optiplex-7070-sff.md](dell-optiplex-7070-sff.md) | `optiplex-7070-sff` (searches.example.json) |
| Dell OptiPlex 7080 SFF | [dell-optiplex-7080-sff.md](dell-optiplex-7080-sff.md) | `optiplex-7080-sff` |
| Dell OptiPlex 7090 SFF | [dell-optiplex-7090-sff.md](dell-optiplex-7090-sff.md) | `optiplex-7090-sff` |
| Dell OptiPlex 7070 Micro | [dell-optiplex-7070-micro.md](dell-optiplex-7070-micro.md) | `optiplex-7070-micro` |
| Dell OptiPlex 7080 Micro | [dell-optiplex-7080-micro.md](dell-optiplex-7080-micro.md) | `optiplex-7080-micro` |
| Dell Precision 3630 Tower | [dell-precision-3630.md](dell-precision-3630.md) | `precision-3630` |
| Dell Precision 5820 Tower | [dell-precision-5820.md](dell-precision-5820.md) | `precision-5820` |
| Dell PowerEdge T140 | [dell-poweredge-t140.md](dell-poweredge-t140.md) | `poweredge-t140` |
| HP EliteDesk 800 G3 SFF | [hp-elitedesk-800-g3-sff.md](hp-elitedesk-800-g3-sff.md) | `elitedesk-800-g3-sff` |
| HP EliteDesk 800 G4 SFF | [hp-elitedesk-800-g4-sff.md](hp-elitedesk-800-g4-sff.md) | `elitedesk-800-g4-sff` (searches.example.json) |
| HP EliteDesk 800 G5 SFF | [hp-elitedesk-800-g5-sff.md](hp-elitedesk-800-g5-sff.md) | `elitedesk-800-g5-sff` |
| HP ProDesk 600 G4 SFF | [hp-prodesk-600-g4-sff.md](hp-prodesk-600-g4-sff.md) | `prodesk-600-g4-sff` |
| HP ProDesk 600 G5 SFF | [hp-prodesk-600-g5-sff.md](hp-prodesk-600-g5-sff.md) | `prodesk-600-g5-sff` |
| HP EliteDesk 800 G4 Mini (Desktop Mini) | [hp-elitedesk-800-g4-mini.md](hp-elitedesk-800-g4-mini.md) | `elitedesk-800-g4-mini` |
| HP Z2 G4 (Tower) | [hp-z2-g4-tower.md](hp-z2-g4-tower.md) | `hp-z2-g4` |
| HP Z2 G4 (SFF) | [hp-z2-g4-sff.md](hp-z2-g4-sff.md) | `hp-z2-g4` |
| HP Z4 G4 | [hp-z4-g4.md](hp-z4-g4.md) | `hp-z4-g4` |
| HP Z440 | [hp-z440.md](hp-z440.md) | `hp-z440` |
| HP ProLiant MicroServer Gen8 | [hp-microserver-gen8.md](hp-microserver-gen8.md) | `microserver-gen8` |
| HPE ProLiant MicroServer Gen10 Plus | [hpe-microserver-gen10-plus.md](hpe-microserver-gen10-plus.md) | `microserver-gen10-plus` |
| Lenovo ThinkCentre M720q Tiny | [lenovo-m720q.md](lenovo-m720q.md) | `thinkcentre-m720q` |
| Lenovo ThinkCentre M920q Tiny | [lenovo-m920q.md](lenovo-m920q.md) | `thinkcentre-m920q` |
| Lenovo ThinkCentre M920s SFF | [lenovo-m920s.md](lenovo-m920s.md) | `thinkcentre-m920s` |
| Lenovo ThinkCentre M90q Gen 2 Tiny | [lenovo-m90q-gen-2.md](lenovo-m90q-gen-2.md) | `thinkcentre-m90q-gen-2` |
| Lenovo ThinkStation P330 (which one?) | [lenovo-p330-which-one.md](lenovo-p330-which-one.md) | `thinkstation-p330` |
| Lenovo ThinkStation P330 Tower (Gen 1) | [lenovo-p330-tower.md](lenovo-p330-tower.md) | `thinkstation-p330` |
| Lenovo ThinkStation P330 Tower Gen 2 | [lenovo-p330-tower-gen-2.md](lenovo-p330-tower-gen-2.md) | `thinkstation-p330` |
| Lenovo ThinkStation P330 SFF (Gen 1) | [lenovo-p330-sff.md](lenovo-p330-sff.md) | `thinkstation-p330` |
| Lenovo ThinkStation P330 SFF Gen 2 | [lenovo-p330-sff-gen-2.md](lenovo-p330-sff-gen-2.md) | `thinkstation-p330` |
| Lenovo ThinkStation P330 Tiny | [lenovo-p330-tiny.md](lenovo-p330-tiny.md) | `thinkstation-p330` |
| Lenovo ThinkStation P520 | [lenovo-p520.md](lenovo-p520.md) | `thinkstation-p520` |
| Fujitsu Esprimo D958 | [fujitsu-esprimo-d958.md](fujitsu-esprimo-d958.md) | `esprimo-d958` |

`optiplex-7070-sff` and `elitedesk-800-g4-sff` are also the ids of the two PC searches in `searches.example.json`.

## How each maker's documents were read

### Dell

- Dell's spec PDFs on `dl.dell.com/content/...` could not be opened. Direct download was refused by this environment's network proxy (HTTP 403), and the web-fetch tool was refused by the site (`robots_disallowed`). The PDF links are listed under each model as "could not open".
- I read the same documents in two other ways. Dell publishes each manual as HTML topic pages on dell.com/support/manuals, one page per spec table, and I fetched those. One older PDF on `dl.dell.com/topicspdf/...` could be fetched. All of this text went through a web-fetch tool that extracts and summarises it. I asked for every table row "exactly as printed". Text in quotes is as that tool returned it. Where the tool said it had paraphrased something, or the table text came back run together, I say so.
- "not stated" means the document I read does not say it. It does not mean the feature is absent.
- None of the OptiPlex or Precision Dell docs I read names the CPU socket. Where I give a socket, it comes from Intel's own product page (intel.com, i.e. ARK) for one sample CPU from that model's list. That tells you the CPU's socket, not what Dell says about the board.
- Every Dell spec topic page ends with the line "Data is not available for the Topic". It is a site message, not a spec, and I've left it out below.
- One item from memory, used only as a warning: (from memory, unchecked) 8th/9th-gen Intel desktop CPUs and 6th/7th-gen ones both use a socket called LGA1151, but they are not interchangeable between boards. Don't treat "same socket name" as a fit.

### HP and HPE

- **HP's QuickSpecs servers were refused.** Both `h20195.www2.hp.com` and `www8.hp.com/h20195/...` came back `robots_disallowed`. There was no certificate error: the fetch tool refused them. So the same HP-authored PDFs were used from other hosts, and every section names the host it came from:
  - HP's own hosts that did work: `support.hp.com` spec pages, `h10032.www1.hp.com` (HP manuals: Maintenance and Service Guides), `h30434.www3.hp.com` (QuickSpecs PDFs attached in the HP Support Community) and `support.hpe.com` (HPE QuickSpecs).
  - Third-party mirrors of HP-authored PDFs: bargainhardware.co.uk, hp.it-shop.bg, gc3.de, rackfinity.com, laptopsdirect.co.uk, cdn.blueally.com, barcodesinc.com and 1worldsync.com. For each one, the HP document number and version printed in the PDF footer is given.
- **Pages were read through a fetch tool that turns them into text and answers questions about them.** Raw downloads of those hosts were blocked by the session proxy, so no PDF was read directly. The tool also limits verbatim quoting. Facts below are therefore short quotes or close paraphrases of what the tool extracted, not a word-for-word copy.
- **QuickSpecs tables lose their columns in extraction.** The multi-form-factor QuickSpecs (DM / SFF / TWR / AiO columns) come out as flat text. Wherever a value's form-factor column had to be inferred, it is marked **(column inferred)**. Where the column could not be told, it is marked "unclear". Form-factor-specific datasheets and service guides were used to cross-check, and any disagreement is shown.
- "not stated" means it was not in the parts of the documents that were read. Items marked "(from memory, unchecked)" are not from any document.
- No eBay pages were opened.

### Lenovo and Fujitsu

- Lenovo facts come from PSREF spec sheets (psref.lenovo.com). Direct download of the PSREF PDFs was refused by this environment's network proxy (HTTP 403), so every PSREF page was read through a web-fetch tool that extracts the text. Text in quotes is as that tool returned it. I could not inspect the raw PDF layout.
- "not stated" means the document I read does not say it. It does not mean the feature is absent.
- Socket and TDP are often missing from PSREF. Where I filled them in, the source is Intel's own product pages (intel.com, i.e. Intel ARK) for one sample CPU from the model's list. That shows the CPU's socket and TDP, not a Lenovo statement about the board.
- PSREF uses different names from the ones sellers use: M720q = "ThinkCentre M720 Tiny", M920q = "ThinkCentre M920 Tiny", M920s = "ThinkCentre M920 SFF". The M920 SFF sheet does not contain the string "M920s". Lenovo's support site does use "m720q" in its URLs, e.g. https://pcsupport.lenovo.com/us/en/products/desktops-and-all-in-ones/thinkcentre-m-series-desktops/m720q/10t7 (search result).

## What each maker's documents didn't say
### Dell

All models:
- The newer Dell spec PDFs on `dl.dell.com/content/...` could not be opened (proxy 403 / robots_disallowed). I read the same guides' HTML topic pages instead.
- CPU socket is not stated in any OptiPlex or Precision Dell doc I read. Sockets above come from Intel ARK for one sample CPU per model.
- M.2 Wi-Fi slot key letter (E / A+E) is not stated for any OptiPlex. Only the Precision 3630 guidebook says "Key-AE".
- Whether Wi-Fi is fitted as standard is not stated for any model. Wi-Fi cards are listed as options.
- Max graphics card length and power, and whether a PCIe graphics power cable exists, are not stated for any OptiPlex SFF or Micro.

Per model:
- **OptiPlex 5070 SFF:** PSU wattage (no PSU topic, and no Dell doc found); Ethernet controller model; slot length; the "Detailed Engineering Specifications" with max card dimensions.
- **OptiPlex 7060 SFF:** slot height in the setup guide (only the spec sheet says half height, with the SFF mapping inferred); exact SATA port count (3 vs 4 in the same doc); PSU connector details.
- **OptiPlex 7070 SFF:** slot height (only a distributor-hosted spec sheet copy, mapping inferred); bay counts in the setup guide; PSU connector details.
- **OptiPlex 7080 SFF:** a PCIe slot table in the setup guide (slot info only from the dell.com product page); ECC wording; M.2 slot list (setup guide and product page disagree); PSU connector pin counts.
- **OptiPlex 7090 SFF:** whether the x16 slot is really Gen4 (internal-slots page) or Gen3 (chipset page). A second check (2026-11-20) found the Dell Thailand product page also says Gen 4, so Gen4 is mostly settled; whether Gen4 needs an 11th-gen CPU is still not stated; exact storage-matrix combinations (columns garbled in fetch).
- **OptiPlex 7070 Micro:** power adapter barrel size; the ports topic page failed to load.
- **OptiPlex 7080 Micro:** length and power limit of the half-height PCIe x8 slot; ECC wording.
- **Precision 3630:** a reliable max card length (the guidebook's 4.50 in figure looks like a template error); which CPUs enable ECC (Dell doesn't say); number of PCIe aux power connectors per PSU; memory speed (3200 vs 2666/2400 conflict; partly settled on a second check, 2026-11-20: Intel lists DDR4-2666 for the sample CPUs, which backs 2666/2400); M.2 lengths (2260 vs 2230 conflict).
- **Precision 5820:** socket in a Dell doc; chipset in the owner's manual; an on-board M.2 slot; a clean slot-1 lane/wattage reading (the fetched text was run together); per-slot length (the guidebook's per-slot table gives slot 1 as half length against its own "all full length" text; per-slot height was found on a second check, 2026-11-20: "Standard" for slots 1–5); the memory population matrix (image only).
- **PowerEdge T140:** ECC confirmation in a dell.com-hosted English doc (only in the Technical Guide copy on a third-party CDN; the French sheet as translated conflicts); graphics card limits; contents of the M.2 SSD module topic; whether there is a dedicated iDRAC port (Technical Guide only, not confirmed elsewhere).

### HP and HPE

#### HP QuickSpecs hosts
- `h20195.www2.hp.com` and `www8.hp.com/h20195` were refused (robots_disallowed), so every QuickSpecs came from a mirror or HP community copy.
- ProDesk 600 G4 QuickSpecs (c06043924): no copy loaded (HP host refused; maytinhcdc.vn mirror failed). That SFF section rests on the HP support spec page and the datasheet.

#### Not stated in any document read, for any model
- CPU socket for the EliteDesk/ProDesk models and both MicroServers. It is stated only for Z2 G4, Z4 G4 and Z440. The values given are from memory, unchecked.
- M.2 key types (B/M/E), including whether the Wi-Fi slot is key E, for every model except the Z4 G4, whose QuickSpecs gives its M.2 storage slot as "Socket Type 3, Key M" (corrected on a second check, 2026-11-20).
- Whether M.2 storage slots accept SATA M.2 drives (only PCIe/NVMe is ever listed).
- Whether the PSUs use proprietary connectors. The ProDesk 600 G5 service guide only describes 12 V supplies with "2 out connectors, 1 control cable connector".
- A PCIe graphics power cable on any EliteDesk/ProDesk SFF.
- Maximum graphics-card length for the SFFs. Only the 800 G3 SFF slot table gives 6.6".

#### Model-specific gaps
- **EliteDesk 800 G3 SFF:**
  - ECC.
  - Which discrete cards the QuickSpecs allows on the SFF (the column could not be read).
  - Which column the QuickSpecs "Standard Efficiency" PSU row belongs to.
- **EliteDesk 800 G4 SFF:**
  - Which column the QuickSpecs PSU values belong to (the datasheet and service guide give 250 W).
  - Per-slot max power.
- **EliteDesk 800 G5 SFF:**
  - An explicit low-profile statement. The datasheet gives "four half-height slots" but does not say whether that means low profile (corrected on a second check, 2026-11-20; the chipset, Q370, is now answered from the SFF datasheet).
  - Per-CPU memory speed limits.
  - Integrated graphics per CPU.
  - Which column the QuickSpecs PSU values belong to (the datasheet gives 250 W).
  - The 800 G5 SFF service guide was not located on HP's manuals host.
- **ProDesk 600 G4 SFF:** slot height / low-profile statement.
- **ProDesk 600 G5 SFF:**
  - Slot height.
  - Which service-guide PSU part (180/250/310 W) is the SFF one (the datasheet says 180 W).
  - The service guide's connector table and memory spec section did not come through.
- **EliteDesk 800 G4 Mini:**
  - Which CPUs go in which 35 W / 65 W / 95 W variant.
  - The 95 W variant's adapter wattage.
  - Adapter connector type.
- **Z2 G4 Tower:**
  - Total graphics power budget and number of PSU PCIe cables.
- **Z2 G4 SFF:** ECC with Core i9 (not addressed in the extracted text).
- **Z4 G4:**
  - BIOS / board-revision requirement for W-2200 and Core X 10th-gen CPUs.
  - Memory channel count.
  - Max per-DIMM size stated as a rule.
  - The conflicting M.2 length (80 mm vs 110 mm) is unresolved.
- **Z440:**
  - BIOS requirement for E5 v4.
  - Whether later QuickSpecs versions raise max memory above 128 GB / 16 GB per DIMM.
  - Whether the 4 sSATA ports are among the 6 SATA ports or extra ones (the QuickSpecs lists both without saying).
- **MicroServer Gen8:**
  - Socket.
  - Whether non-ECC UDIMMs work.
  - Slot length/power.
  - PSU efficiency and connector.
  - Whether the ODD uses one of the 5 SATA connectors.
- **MicroServer Gen10 Plus:**
  - Socket.
  - Max supported TDP for CPU swaps.
  - Slot length/power.
  - SATA port count.
  - Adapter efficiency and connector.
- **Z2 Mini G4 and MicroServer Gen10 Plus v2:** not researched. They are only noted as separate models a search name could also match.

### Lenovo and Fujitsu

- **CPU socket** in the maker's doc for: M720q, M920q, M920s, M90q Gen 2, and P330 Tower/SFF Gen 1. I filled these only with Intel's spec page for one sample CPU each.
- **Max CPU TDP** in the maker's doc for: M720q, M920q, M920s, M90q Gen 2, P330 Tiny, P330 Tower Gen 2, P330 SFF Gen 2, P520 and D958.
- **Which P330 Tiny CPUs count as "35W"** for the discrete-GPU rule. The table doesn't mark them.
- **ECC support** for M720q, M920q, M920s and M90q Gen 2. PSREF is silent.
- **Max per memory stick** for M720q, M920q, M920s, M90q Gen 2, P330 Tiny and P330 Gen 2.
- **M.2 Wi-Fi slot key and size** (e.g. 2230 key E) for every Lenovo model. Only Fujitsu states "M.2-2230".
- **M.2 SSD length** for P330 Tower/SFF Gen 1, P330 Tiny, P330 Gen 2 and P520.
- **Whether M.2 SATA SSDs work** for every model. Only NVMe types are listed.
- **SATA port count** for M720q, M920q, M920s, M90q Gen 2, P330 Tower Gen 2, P330 SFF Gen 2 and P520. For the P520, a thinkstation-specs.com sheet says 6, but I couldn't confirm that site is Lenovo's.
- **Graphics card limits:**
  - Max card length for P330 Tower/SFF, P520 and D958.
  - Max card power and PCIe power cable for M920s, P330 SFF (both gens) and D958.
  - Aux connector count for P330 Tower Gen 2.
  - Aux connector count for P520 from Lenovo itself. Only the unconfirmed thinkstation-specs.com sheet gives it.
  - Whether the P330 Tower's 250W PSU has any aux connector.
- **P330 SFF Gen 1 slot height.** PSREF says full height; the Gen 2 PSREF says low profile. This is unresolved.
- **M90q Gen 2:**
  - How the optional PCIe x4 I350-T4 NIC attaches, since no PCIe slot is listed.
  - Which M.2 slot is PCIe 4.0, and whether that needs an 11th-gen CPU.
  - Which power adapter goes with which CPU.
- **Riser** for the M720q/M920q PCIe slot. PSREF doesn't mention one, unlike the P330 Tiny sheet.
- **PSU connector type or proprietary pinout** for every model.
- **BIOS version requirements** for any CPU generation, e.g. 9th-gen in M720q/M920q/D958 or W-2200 in P520. No doc states one.
- **Integrated graphics on P520 CPUs.** Not stated in the docs read.
- **Fujitsu:**
  - The official data sheet URL no longer works, so I read a third-party-hosted copy.
  - Whether "D958/E94" without the "+" is a real variant.
  - The height of the PCIe x4 (mech x16) slot.
  - Which of the two conflicting eSATA counts is right.


## Adding a machine
Gather it the same way: the maker's own document first, every fact with its source, "not stated" rather than a guess, and both values where sources disagree. Then have a fresh session check it against the sources before it goes in.
