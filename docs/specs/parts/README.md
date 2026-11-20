# Spec reference for parts

What the makers' own pages say about the CPUs, motherboard chipsets and graphics cards the deal watcher's catalogue searches for, and the Xeon E and Xeon W CPUs inside its workstations and small servers: which CPUs a chipset takes and when it needs a BIOS update first, memory type, ECC, PCIe, built-in graphics, whether a cooler comes in the box, and for graphics cards their power draw, power connector, power supply, size, slot width and bracket. The `pc-build` and `deal-check` skills read these to check whether used parts fit together, the same way they read the machine files one folder up (`docs/specs/README.md`).

## How it was made
- **Gathered 20 November 2026** by three Claude research agents, one for AMD, one for Intel and one for graphics cards, from the makers' own pages: AMD's chipset, product, driver and support pages; Intel's chipset and processor pages (the old ARK), compatible-product lists, datasheets and support articles; NVIDIA's product pages and datasheets; and the board partners' pages for particular cards (Sparkle, ASRock, PNY, MSI, Gigabyte, Zotac, ASUS, Sapphire). A well-known secondary source (TechPowerUp, Tom's Hardware, an ASUS FAQ) appears only where the maker says nothing, and is marked.
- **Read through a web-fetch tool** that turns a page into text and answers questions about it. amd.com, intel.com and nvidia.com refused direct downloads from this environment, so nothing was read straight from the page. The tool limits each verbatim quote to about 125 characters and sometimes paraphrases; where it said it did, the file says so.
- **Checked by separate agents** that hadn't seen the research being done. They opened the cited pages again and checked the facts that matter for fit. The first checks went through about 1,035 values (AMD about 400, Intel about 350, graphics cards about 285) and found 7 wrong, none of them a socket, chipset, memory, ECC, power or size figure: two inexact AMD quotes, two inexact Intel quotes, and three side facts about graphics cards (the most serious, that HDMI adapters come in the T400's box). They also found gaps that mattered more, now filled: the conditions on AMD's loan CPU for BIOS updates, the AM5 chipsets, Intel's statements on 13th and 14th gen chips that already show symptoms, and Intel's A-Series platform list for the Arc A310. A second set of checkers then went over every corrected line and found 2 more wrong, both fixed: a claim about what "Ryzen 4000" meant in 2020 news coverage, and a Tom's Hardware headline credited to Intel. A third check of the last Intel edits found nothing wrong, and three loose wordings were tightened. The Xeon E and Xeon W files (added the same day) went through the same steps: two research agents read all 39 models' Intel pages, two checkers re-opened them and found no wrong spec value, and a second check of every corrected line found nothing wrong. The checkers' own notes are kept outside the repo.
- Each file opens with the notes its researcher wrote on how they read the pages.

## How far to trust a fact
- Every fact names the page it came from. Text in quotes is as the fetch tool returned it, which isn't always word for word.
- **"not stated"** means the pages read don't say it, not that the feature is missing.
- **"(secondary)"** is from a source other than the maker. **"(search snippet)"** is from a search result, not an opened page.
- **"(tool paraphrase)"** and **"(fetch tool paraphrase)"** are the fetch tool's summary of the maker's page, not the maker's words.
- Anything marked as an inference, in any wording ("(inference)", "(inference, not stated by the maker)", "(Inference, not stated by Intel: ...)", "(inference from what was read ...)"), and **"(my arithmetic)"**, is the researcher's reading or working, not the maker's.
- **"(from memory, unchecked)"** isn't from any page. Don't count it as checked.
- Only a fact given as the maker's own words or figures, with its source, and none of those marks, is settled.
- Where sources disagree, both are given. A fact given as a conflict isn't settled. Two that matter: AMD's AM4 table and its 2022 press release say A320 boards can take Ryzen 5000 with a beta BIOS, but the 5600's and 5700X's own chipset lists leave A320 out; and Intel's support articles say 600-series boards "require" and "may require" a BIOS update for 13th and 14th gen.
- Makers revise pages. These are the versions read in November 2026.

## Which file covers which part

| Parts | File | Catalogue searches |
|---|---|---|
| AMD AM4 chipsets (A320, B350, X370, B450, X470, A520, B550, X570) and AMD's BIOS statements | [amd-am4-boards.md](amd-am4-boards.md) | `b450-motherboard`, `b550m`, `b550-atx`, `x570-motherboard`, `am4-b550-bundle`, `am4-x570-bundle` |
| AMD AM5 chipsets | [amd-am5-boards.md](amd-am5-boards.md) | none (the board side for `ryzen-5-7600`) |
| AMD Ryzen 5 5600, 5600X, 5600G, Ryzen 7 5700X, 5700G, 5800X, Ryzen 9 5900X, 5950X, Ryzen 5 7600, and telling them apart | [amd-ryzen-cpus.md](amd-ryzen-cpus.md) | `ryzen-5-5600`, `ryzen-5-5600g`, `ryzen-7-5700x`, `ryzen-7-5700g`, `ryzen-7-5800x`, `ryzen-9-5900x`, `ryzen-9-5950x`, `ryzen-5-7600` |
| Intel LGA1700 chipsets (H610, B660, H670, Z690, B760, H770, Z790) | [intel-lga1700-boards.md](intel-lga1700-boards.md) | `b660-motherboard`, `b760m-ddr4`, `b660-bundle` |
| Intel LGA1151 300-series chipsets (H310, B360, H370, Q370, Z370, Z390, C246) | [intel-300-series-boards.md](intel-300-series-boards.md) | `c246-motherboard` |
| Intel Core i5-8500, i5-9500, i7-8700, i7-9700, i5-12400, i5-12400F, i5-12600K, i7-12700, i7-12700K, i7-12700F, Xeon E-2236 | [intel-cpus.md](intel-cpus.md) | `i5-8500`, `i5-9500`, `i7-8700`, `i7-9700`, `i5-12400`, `i5-12600k`, `i7-12700`, `xeon-e-2236` |
| Intel 13th and 14th gen desktop instability | [intel-13th-14th-gen-instability.md](intel-13th-14th-gen-instability.md) | none (for any 13th or 14th gen Core CPU, alone, in a bundle or in a PC) |
| Intel Xeon E-2124 to E-2186G and E-2224 to E-2288G (in the Precision 3630, PowerEdge T140, Z2 G4, MicroServer Gen10 Plus and P330s) | [intel-xeon-e.md](intel-xeon-e.md) | none (the CPUs inside those machine searches) |
| Intel Xeon W-2102 to W-2195 and W-2223 to W-2295 (in the Precision 5820, Z4 G4 and P520) | [intel-xeon-w.md](intel-xeon-w.md) | none (the CPUs inside those machine searches) |
| Intel Arc A310 (and Sparkle and ASRock cards) | [intel-arc-a310.md](intel-arc-a310.md) | `arc-a310` |
| NVIDIA Quadro P620 | [nvidia-quadro-p620.md](nvidia-quadro-p620.md) | `quadro-p620` |
| NVIDIA T400 | [nvidia-t400.md](nvidia-t400.md) | `nvidia-t400` |
| NVIDIA GeForce GTX 1650 (reference and low-profile cards) | [nvidia-gtx-1650.md](nvidia-gtx-1650.md) | `gtx-1650-low-profile` |
| NVIDIA GeForce RTX 3060 (12GB, 8GB and Ti) | [nvidia-rtx-3060.md](nvidia-rtx-3060.md) | `rtx-3060-12gb`, `pc-rtx-3060-12gb` |
| AMD Radeon RX 6600 and RX 6600 XT | [amd-rx-6600.md](amd-rx-6600.md) | `rx-6600` |
| AMD Radeon RX 6700 XT and RX 6700 | [amd-rx-6700-xt.md](amd-rx-6700-xt.md) | `rx-6700-xt` |
| Intel Arc B580 | [intel-arc-b580.md](intel-arc-b580.md) | `arc-b580` |

## What wasn't found
Each research file's own list of what it couldn't find is in [gaps.md](gaps.md). The biggest: no maker gives a minimum BIOS version for a chipset and CPU pair (AMD and Intel point to the board maker's site), and no page here covers RAM or power supplies.
