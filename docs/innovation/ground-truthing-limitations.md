# Analysis of current ground-truthing limitations

Item 38. Ground-truthing here means going to a plant, confirming what it is and where it is, and
recording that so other people can trust it. This doc looks at what limits the way that's done now,
how bad each limit is, and which part of our system answers it. It also says where we don't have an
answer. [Item 39](improved-workflow.md) builds the new workflow on these limitations, using the same
L1 to L12 labels.

## What this is based on

- **Current practice comes from one source.** The Project Scope says practice in Sarawak's protected
  areas is largely manual. Plants get identified and labelled, details go on paper, and someone
  transfers them to a digital database later. It says this is slow and labour intensive, and that it
  risks lost data and inconsistent records.
- **We have no field trials, interviews or measurements from Niah.** So nothing below is a measured
  Niah result. We don't know how closely the Scope's description matches what staff do day to day.
- **Outside evidence comes from other places.** We say so each time, because a study of Amazon trees
  or German forests only tells us so much about Niah.
- **"How bad" is our judgement.** We asked three things: how much harm it does, whether it can be
  undone, and how many roles it hits. SFC may rank these differently.
- **Our system's status comes from our code and test results.** Tests ran on simulators, a browser
  and a local stand-in database. Nothing has been used in the forest yet.

## Why Niah makes this harder

- **The place.** Niah National Park is about 3,138 ha of forest and limestone karst (Free Malaysia
  Today, 2024). It's dense lowland rainforest around a cave system, about two hours' drive from Miri
  or Bintulu (Sarawak Forestry Corporation, n.d.). A lost record can mean another trip.
- **The plants.** Southeast Asian limestone karsts have many species found nowhere else, and
  exploitation has already caused declines and extinctions of species found at single sites (Clements
  et al., 2006). That paper covers the region, so it isn't direct evidence about Niah.
- **The signal.** Our Solution Direction says most survey areas have little or no signal. That's our
  assumption. Nobody has measured it.
- **The demand.** Phelps and Webb (2015) found 347 orchid species in the four largest wildlife markets
  in Thailand, many of them threatened. Hinsley et al. (2018) report that a large share of the orchid
  trade comes from illegal harvest and doesn't appear in official statistics. Neither study is about
  Sarawak, and we have no evidence that Niah's plants are being traded. They show why we shouldn't
  assume a location is harmless.
- **The roles.** Botanists record. Conservation officers check and correct. Admins want early warning
  of threats. Researchers need data they can cite. Visitors read public pages. Each one needs
  something different from the same record, and some of them mustn't see all of it.

## The limitations, ranked

| Rank | Limitation | How bad | Why it sits here | Our system today |
| --- | --- | --- | --- | --- |
| 1 | L9 Exact locations getting out | High | It can't be undone, and one leak can cost a plant | Rough areas built, tested on the local stand-in. Wrong names can still get past it |
| 2 | L2 Paper records lost before entry | High | The only copy, and the trip may not be repeatable | Offline save built, simulator and browser only |
| 3 | L7 Wrong names, no clear check | High | It hurts everyone downstream, and it also feeds L9 | Review queue built, stand-in only. The reviewer sees a photo, not the plant |
| 4 | L1 Locations with unknown accuracy | High | A record that can't be found again loses most of its value | GPS capture built, iOS simulator only |
| 5 | L6 No signal in the field | High, if our assumption holds | Rules out any tool that needs a connection, but it's unmeasured | Offline first. Upload is partly built |
| 6 | L11 Nothing watching between visits | Medium to high | Damage goes unseen, but our answer is the least proven | Proposed. Dashboard numbers are made up, no link from sensor to plant |
| 7 | L10 Tags and hardware mark the plant | Medium | Only hits some plants, but our own design adds to it | Not answered |
| 8 | L4 Tags not tied to a record | Medium | Costs time on revisits, and can usually be recovered | Scanner built, printing being built |
| 9 | L3 Double handling, inconsistent records | Medium | Wastes time and adds errors, but is mostly fixable later | Form with checks built, upload being built |
| 10 | L5 Long gap before data is usable | Medium | Causes delay rather than loss. We don't know how long the gap is | Being built |
| 11 | L8 No clear trail of who checked what | Medium | Lowers trust, but doesn't lose the data itself | Stamps and edit history built, stand-in only |
| 12 | L12 Labour, training and upkeep | Medium, unknown | We have no cost data, yet this could decide if SFC adopts it | Not answered |

The ranks are close in places. We put L9 first because it's the only one where a mistake can't be
fixed afterwards.

## A. Accuracy and location

### L1. Locations with unknown accuracy (High, rank 4)

- **What goes wrong:** a location with no accuracy attached can't be judged later. Nobody can tell a
  good reading from a bad one.
- **Why it matters here:** someone has to find one plant again in dense forest, and canopy and cliffs
  block the sky.
- **Evidence:** the GBIF guide says coordinates without an uncertainty aren't a proper georeference,
  and that receivers work poorly under heavy canopy (Chapman & Wieczorek, 2020). Phones typically get
  within 4.9 m under open sky and do worse near trees and buildings (National Coordination Office for
  Space-Based Positioning, Navigation, and Timing, 2022). Across 15 forest sites in Germany, the error
  ranged from 4.56 m for the best phone to 14.59 m for the worst, and identical models varied
  (Purfürst, 2022). That's temperate forest. We found no figures for tropical karst.
- **Our answer:** the phone keeps a fix of 10 m or better straight away. Otherwise it keeps trying for
  up to 30 s and keeps the best one, and the person can choose to accept it early. A record can't be
  saved without a location, and the accuracy is saved with it. After 3 minutes with no fix, it tells
  the person to move away from cliffs and thick canopy ([item 8](../test-results/item-8-gps.md)).
- **Still open:** this has only run on the iOS simulator. Knowing the error doesn't shrink it, so a
  poor reading under a cliff is still poor.

## B. Data capture

### L2. Paper records lost or damaged before entry (High, rank 2)

- **What goes wrong:** until a sheet is typed up, it's the only copy.
- **Why it matters here:** a rare plant may be hard to find twice, and a repeat trip takes time.
- **Evidence:** the Scope names information loss as a problem. We found no study giving a loss rate
  for botanical field sheets, so we can't say how often it happens. To be fair to paper, RAINFOR's
  field manual still uses waterproof pre-printed sheets in Amazon tree plots (Phillips et al., 2018,
  p. 15). Careful paper can work.
- **Our answer:** records are saved in SQLite on the phone and survive a restart
  ([item 9](../test-results/item-9-offline-storage.md)). That's been tested on the iOS simulator and
  a browser only.
- **Still open:** we swap losing a sheet for losing a phone. A phone that breaks before upload loses
  what's on it. Encrypting the phone's data (item 22) isn't merged yet. We haven't tested rain, heat
  or battery life.

### L3. Double handling and inconsistent records (Medium, rank 9)

- **What goes wrong:** the same details get written and then typed, and different people write them
  differently. The Scope lists duplicated work and inconsistent records as results of this.
- **Why it matters here:** records from different people have to line up before a researcher can use
  them.
- **Evidence:** in a large trachoma survey in Ethiopia, tablets removed double entry and gave similar
  error levels to paper, but took about the same time per person, about 264 s on paper and 260 s on a
  tablet (King et al., 2013). That's a health survey, and direct evidence for botany looks thin. It's
  a warning that going digital doesn't automatically save field time.
- **Our answer:** the form has species suggestions and checks
  ([item 7](../test-results/item-7-record-form.md)). The record is typed once. The upload rules mean
  sending a record twice doesn't create a second copy ([sync design](../sync-design.md)).
- **Still open:** the phone side of upload is being built (item 10). After first upload the phone
  can't edit a record, so fixes go through an officer.

### L4. Physical tags not tied to a record (Medium, rank 8)

- **What goes wrong:** a label only helps if someone can find the sheet that goes with it. Tags also
  get lost or overgrown.
- **Why it matters here:** the Scope names physical tagging as part of the problem, and the proposal
  has botanists scanning tagged plants to reopen their records.
- **Evidence:** RAINFOR says relocating plants takes a long time where many trees have lost their
  tags, and has teams leave nails long so a growing tree doesn't swallow the tag (Phillips et al.,
  2018, pp. 6, 15). Those are Amazon tree plots, so small plants like orchids may differ.
- **Our answer:** the scanner reads a tag and opens the record with no signal, and the code can be
  typed if the tag won't scan ([item 6](../test-results/item-6-qr-scanner.md)). Printing is item 12,
  being built.
- **Still open:** a scan only finds records on that phone. Real scan timing and dirty, wet or curved
  tags haven't been tested, because the simulator has no camera. A QR tag can fall off too.

## C. Delay and sync

### L5. Long gap between the field and usable data (Medium, rank 10)

- **What goes wrong:** paper can't be used until someone enters it, so officers, researchers and
  visitors work from old information.
- **Why it matters here:** the Scope's second problem is limited access to up to date information.
- **Evidence:** only the Scope and our Solution Direction. We don't know how long the gap is at SFC.
  It could be days or months, and that changes how much this matters.
- **Our answer:** the phone uploads once it has signal, and the website reads from the same database.
  The server side is done (item 3) and the phone side is being built (item 10).
- **Still open:** part of the wait moves to the review queue. If officers are busy, records still sit.

### L6. No signal, so live sending isn't an option (High if our assumption holds, rank 5)

- **What goes wrong:** anything that needs a connection in the field stops working.
- **Why it matters here:** if our Solution Direction is right, this is the normal state of a survey.
- **Evidence:** only our own assumption. We found no published coverage data for the survey areas. SFC
  would know.
- **Our answer:** the form, GPS, scanner and local save are built to work with no signal. The tag code
  is made on the phone. None of this has been tried somewhere that really has no signal.
- **Still open:** phone sign in comes with item 10, and we need to check how it behaves on a phone
  that's left signal. The species list only changes with an app update until item 10 lands.

## D. Verification and trust

### L7. Wrong names and no clear check before use (High, rank 3)

- **What goes wrong:** a plant gets the wrong name and nobody catches it. The Scope doesn't describe a
  checking step, so we don't know whether SFC has one.
- **Why it matters here:** researchers may cite the name, and in our system the name also decides
  whether the exact spot goes public (L9).
- **Evidence:** in 4,500 African ginger specimens from 40 herbaria, at least 58% had the wrong name,
  and the authors expect more than half of tropical specimens are misnamed on average (Goodwin et al.,
  2015). Those are herbarium specimens, not field records. RAINFOR calls identification specialised
  and slow, and sends plants that aren't certain to a herbarium (Phillips et al., 2018, p. 14). Writing
  about citizen science, Kosmala et al. (2016) find quality depends on project design, including
  training, expert checks and repeats.
- **Our answer:** an officer checks each record in a review queue that shows GPS accuracy, photos and
  whether the name matches the species list. Approve is refused while the name disagrees with the
  linked species. Reject needs a reason ([item 19](../test-results/item-19-observation-approval.md)).
  Tested on the local stand-in.
- **Still open:** the officer sees a photo, not the plant. A confident wrong name with a blurry photo
  can pass. We haven't asked whether officers have time for this.

### L8. No clear trail of who checked what (Medium, rank 11)

- **What goes wrong:** once a record has been copied and corrected, it's hard to see who changed what.
- **Why it matters here:** researchers need data reliable enough to cite.
- **Evidence:** RAINFOR keeps the original measurement, the presumed error and the correction rather
  than overwriting (Phillips et al., 2018, p. 18). It's a good model for us.
- **Our answer:** the database stamps who reviewed a record and when (SQL 006), and keeps an
  [edit history](../test-results/edit-history.md) (SQL 013). Tested on the local stand-in.
- **Still open:** a trail shows who approved a record, not that they were right.

## E. Protecting sensitive locations

### L9. Exact locations getting out (High, rank 1)

- **What goes wrong:** once the spot of a rare plant is public, it can't be taken back. It can leak
  through a page, an API response, a map, a report or a photo's metadata.
- **Why it matters here:** the demand evidence above, plus plants that may not exist elsewhere.
- **Evidence:** the GBIF guide says to generalise only a copy at distribution and keep the original,
  to document what was done, and not to restrict more than needed. It warns that other fields can give
  a location away (Chapman, 2020). iNaturalist hides sensitive species automatically, inside a
  rectangle of 0.2 degrees (iNaturalist, n.d.).
- **Our answer:** a record only shows its exact spot if its species is in our table, is Least Concern
  or Near Threatened, isn't Sarawak protected and isn't flagged rough area only. Everything else,
  including unknown names, shows the middle of a 0.004 degree square, about 440 m at Niah
  (`supabase/007_species_fixes.sql`). It's worked out when the data is read, and the exact point stays
  for officers and admins. Species photos have their metadata stripped
  ([item 18](../test-results/item-18-photo-gallery.md)), and exact spot report downloads get logged.
  Tested on the local stand-in.
- **Still open:** a rare plant wrongly named as a common species shows its exact spot (L7). Record
  photos still need the metadata check once item 11 lands. The square size is SFC's decision. Ours
  sits between GBIF's low category of 0.001 degrees (about 100 m) and medium of 0.01 (about 1 km), and
  is far tighter than high at 0.1 (about 10 km) (Chapman, 2020). The park is only about 5.6 km across
  if it were square (our arithmetic), so the larger sizes would just say "in the park". Researchers see
  what the public sees for now, because SFC approved exact access isn't built.

### L10. Tags and hardware mark the plant (Medium, rank 7)

- **What goes wrong:** a visible tag says this plant matters. On a protected plant, scanning it tells
  anyone standing there which species it is, and that beats the rough area. A sensor node does the
  same.
- **Why it matters here:** our Solution Direction wants a visitor's normal camera to open a public
  page. Our public tag page hides the map for these species but still shows the species name and the
  protected badge.
- **Evidence:** RAINFOR says permanent markers mustn't attract too much attention (Phillips et al.,
  2018, p. 5). A survey of poaching detection says sensors need camouflage so they aren't spotted or
  damaged (Kamminga et al., 2018). That survey is about animals.
- **Our answer:** none yet. A QR tag can say more than a plain numbered label would. Item 39 gives
  options, and SFC has to choose.

## F. Monitoring between visits

### L11. Nothing watching between visits (Medium to high, rank 6)

- **What goes wrong:** a survey shows a plant on one day. Theft, damage or drying out goes unseen until
  someone comes back.
- **Why it matters here:** the proposal's admins want early warning, and the gap between visits may be
  long. We don't know how long.
- **Evidence:** Kamminga et al. (2018) find that high sensitivity brings false alarms, that wind and
  rain cause false triggers, and that no system they reviewed has both high detection and low response
  time. Radio is a problem too. Reported LoRa range falls to a few hundred metres in woods (Bianco &
  Marrocco, 2022, a poplar wood in Italy, with a drone above and a person below). In a tropical study,
  tree canopy was where the free space path loss model stopped fitting (Ansah et al., 2020).
- **Our answer:** the proposal has ESP32 sensor nodes reporting to a dashboard, for monitoring only.
  The dashboards are being built (items 28 to 31). Every sensor number on main is made up, and the
  team's sensor work so far is bench tests of single parts.
- **Still open:** this is our least proven answer. The node table has no link to a plant, so an alert
  can't name one. Nobody gets notified in the field, and we have no ranger role. Sensors can only ever
  cover selected plants.

## G. People and cost

### L12. Labour, training and upkeep (Medium, unknown, rank 12)

- **What goes wrong:** field work takes people, and a digital system adds phones, charging, training,
  tags, sensors and hosting.
- **Why it matters here:** a system SFC can't afford or keep running won't help any plant.
- **Evidence:** the Scope calls current practice labour intensive. For scale only, RAINFOR puts a new
  1 ha plot at about 48 person-days and a recensus at about 13 (Phillips et al., 2018, pp. 14, 17).
  Sensors left out for months or years need upkeep, since weather and wildlife disable parts (Kamminga
  et al., 2018).
- **Our answer:** none. We have no cost data from SFC. The proposal's usability targets (90% task
  completion, SUS 70 or above) haven't been tested with SFC staff. We depend on Supabase and Vercel,
  and our documents don't say who runs the system after handover.

## Limits of our own system

Some of these came up above. They're together here because they shouldn't get lost.

- **Never used in the forest.** Results so far come from simulators, a browser and a local stand-in
  database. GPS has never run under real canopy or next to karst cliffs.
- **Half the phone flow is still being built.** That's sign in, upload, photos and printing (items
  10, 11, 12).
- **Tags are printed after the code exists.** The code is made when a record is saved in the forest,
  but nobody can print out there. Item 39 deals with this gap.
- **Tag codes can clash.** A code is `NNP-` plus 6 hex digits, about 16 million codes, so a clash
  becomes likely after a few thousand records. The [sync design](../sync-design.md) handles it, but a
  code can't simply change once its tag is printed.
- **Rough areas rely on the right name.** See L7 and L9.
- **Phones can't edit after first upload, and a scan only finds records on that phone.** Revisits need
  more design.
- **Nobody in the field gets told anything.** The website doesn't notify anyone about reviews, and the
  design only shows alerts on a dashboard.
- **Physical tags and sensors can give a protected plant away.** See L10.

## What we still don't know

These are questions for SFC. The answers could change the ranking.

- How does a survey run today, and how long does a record take to reach a database?
- Where in the survey areas is there signal?
- Which species should be hidden, and how coarse should the rough area be?
- Will SFC accept tags on protected plants at all?
- Who would go out after an alert, and how soon?
- How much officer time is there for reviewing records?

## References

**Project documents (not published):** Project Scope, the team's proposal, Solution Direction, and
Stakeholders and Quality Management. Our team reports don't set a citation style, so we use APA here.

Ansah, M. R., Sowah, R. A., Melià-Seguí, J., Katsriku, F. A., Vilajosana, X., & Banahene, W. O. (2020).
Characterising foliage influence on LoRaWAN pathloss in a tropical vegetative environment. *IET
Wireless Sensor Systems, 10*(5). https://doi.org/10.1049/iet-wss.2019.0201

Bianco, G. M., & Marrocco, G. (2022). *Indirect propagation of body-UAV LoRa links over wood and
suburb* [Conference paper]. 3rd URSI AT-AP-RASC, Gran Canaria.
https://www.ursi.org/proceedings/procAT22/ATAPRASC2022-papers/MDG0A59MQB.pdf

Chapman, A. D. (2020). *Current best practices for generalizing sensitive species occurrence data*.
GBIF Secretariat. https://doi.org/10.15468/doc-5jp4-5g10

Chapman, A. D., & Wieczorek, J. R. (2020). *Georeferencing best practices*. GBIF Secretariat.
https://doi.org/10.15468/doc-gg7h-s853

Clements, R., Sodhi, N. S., Schilthuizen, M., & Ng, P. K. L. (2006). Limestone karsts of Southeast Asia:
Imperiled arks of biodiversity. *BioScience, 56*(9), 733-742.
https://doi.org/10.1641/0006-3568(2006)56[733:LKOSAI]2.0.CO;2

Free Malaysia Today. (2024, July 27). *Niah Caves now a World Heritage site*.
https://www.freemalaysiatoday.com/category/nation/2024/07/27/niah-caves-now-a-world-heritage-site

Goodwin, Z. A., Harris, D. J., Filer, D., Wood, J. R. I., & Scotland, R. W. (2015). Widespread mistaken
identity in tropical plant collections. *Current Biology, 25*(22), R1066-R1067.
https://doi.org/10.1016/j.cub.2015.10.002

Hinsley, A., de Boer, H. J., Fay, M. F., Gale, S. W., Gardiner, L. M., Gunasekara, R. S., Kumar, P.,
Masters, S., Metusala, D., Roberts, D. L., Veldman, S., Wong, S., & Phelps, J. (2018). A review of the
trade in orchids and its implications for conservation. *Botanical Journal of the Linnean Society,
186*(4), 435-455. https://doi.org/10.1093/botlinnean/box083

iNaturalist. (n.d.). *How does iNaturalist protect the locations of sensitive species?*
https://help.inaturalist.org/en/support/solutions/articles/151000233080-how-does-inaturalist-protect-the-locations-of-sensitive-species-

Kamminga, J., Ayele, E., Meratnia, N., & Havinga, P. (2018). Poaching detection technologies: A survey.
*Sensors, 18*(5), 1474. https://doi.org/10.3390/s18051474

King, J. D., Buolamwini, J., Cromwell, E. A., Panfel, A., Teferi, T., Zerihun, M., Melak, B., Watson, J.,
Tadesse, Z., Vienneau, D., Ngondi, J., Utzinger, J., Odermatt, P., & Emerson, P. M. (2013). A novel
electronic data collection system for large-scale surveys of neglected tropical diseases. *PLoS ONE,
8*(9), e74570. https://doi.org/10.1371/journal.pone.0074570

Kosmala, M., Wiggins, A., Swanson, A., & Simmons, B. (2016). Assessing data quality in citizen science.
*Frontiers in Ecology and the Environment, 14*(10), 551-560. https://doi.org/10.1002/fee.1436

National Coordination Office for Space-Based Positioning, Navigation, and Timing. (2022). *GPS
accuracy*. GPS.gov. https://archive.gps.gov/systems/gps/performance/accuracy/

Phelps, J., & Webb, E. L. (2015). "Invisible" wildlife trades: Southeast Asia's undocumented illegal
trade in wild ornamental plants. *Biological Conservation, 186*, 296-305.
https://doi.org/10.1016/j.biocon.2015.03.030

Phillips, O., Baker, T., Feldpausch, T., & Brienen, R. (2018). *RAINFOR field manual for plot
establishment and remeasurement* (2018.1 ed.).
https://forestplots.net/upload/publication-store/itm_141/RAINFOR_field_manual_EN.pdf

Purfürst, T. (2022). Evaluation of static autonomous GNSS positioning accuracy using single-, dual-, and
tri-frequency smartphones in forest canopy environments. *Sensors, 22*(3), 1289.
https://doi.org/10.3390/s22031289

Sarawak Forestry Corporation. (n.d.). *Niah National Park*.
https://sfc.sarawak.gov.my/web/subpage/webpage_view/62
