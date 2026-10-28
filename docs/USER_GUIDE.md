## Using the web apps

Open the Public Calendar to view dates and obtain personal subscriptions. Choose Sign in for staffing to open the authenticated editor. Its Staffing tab shows a month grid of authorized chairs. Click one performance to edit only its seats; matinee and evening shows have separate dialogs. Assignments and unavailable players are separate. Save each seat independently. First names are displayed while permanent player IDs identify the records.

Administrators can select Administration to load players, shows, chair rosters, performance dates and run rules automatically. Use Preview bulk dates before creating a run. All new seats begin blank and need coverage. Apply chair permissions is available in this tab on desktop and mobile. The admin-only Open workbook link is for setup or exceptional maintenance; use Public Calendar in the header to return to the viewing and subscription page.

The reference demo provides a fictional role selector instead of Google login. Its calendar download is a snapshot, and changes reset on page reload.

# Pit Orchestra Calendar

Calendar quick guide

The public calendar and this guide can be read without signing in. Editing the schedule requires a Google account and access granted by a calendar administrator.

## Find your dates

- Choose a Show, Player and Month. Select Full roster to see everyone. Clear filters if an expected date is missing.

- Month shows the schedule grid; click a performance for its roster. List shows the rosters directly. On a phone, use List or swipe the grid sideways.

- All times are Eastern (America/New_York). Call is when you must arrive; curtain is the show’s start. A matinee and evening performance are separate entries.

- Staffing → Needs cover highlights assignments needing coverage. Check the status as well as the player’s name.

## Subscribe to your dates

1. Choose your name in Player. Under My calendar subscription, select Copy URL.

1. Add that URL as a subscription in your calendar application:

- Google Calendar: on a computer, use Other calendars → + → From URL. Paste the URL and add the calendar.

- Apple Calendar on Mac: File → New Calendar Subscription. Paste the URL, then Subscribe. The calendar page also offers Open in Apple Calendar.

- Outlook on the web: Add calendar → Subscribe from web. Paste the URL, give the calendar a name, and import.

Subscribe once rather than importing a downloaded .ics file. Your feed includes all published dates assigned to your player ID, regardless of the page’s show or month filters. Events start at call time; your calendar app may display them in its own time zone.

Tentative and Needs sub dates stay in your feed until reassigned. Calendar apps refresh on their own schedule, so changes may take time to appear. Reload the public calendar for the current schedule and contact affected players directly about urgent changes.

## Change one chair assignment

Open the staffing workbook shared with you and sign in with your authorized Google account. You may manage every assignment for your authorized chair, including dates assigned to other players.

1. Open your chair’s tab. Check the date, curtain time and PerformanceID so you edit the correct performance.

1. Change PlayerID in column E using the chair-specific dropdown. If a substitute is missing, ask an administrator to add them and make them eligible.

1. Set AssignmentStatus in column F: Confirmed, Tentative, Needs sub or Open. Clearing PlayerID makes the seat Open. Needs sub keeps the current player assigned until a replacement is entered.

1. Use PublicNote in column G for information everyone may see. Keep private contact details and restricted music links out of it. Google Sheets saves edits automatically.

Change only the intended cells. Avoid pasting a complete roster, deleting rows or changing IDs. To recover a mistake, right-click the affected cell and use Show edit history, then restore that cell’s intended value. Ask an administrator for help with bulk damage.

## Record conflicts and find cover

On your chair tab, enter unavailable player IDs in column J (UnavailablePlayerIDs), separated by commas—for example alex,sam. Add to the existing list rather than replacing other players’ conflicts. Record each performance separately; matinee and evening conflicts can differ. No reason is required or published.

The assigned player stays in column E. If that player is marked unavailable, the status becomes Needs sub while their name stays visible. Pick up a date by selecting your PlayerID in column E; a non-conflicted replacement defaults to Confirmed. Keep the outgoing player’s conflict in J. To withdraw a conflict, remove only that ID and confirm the assignment status if appropriate.

Column K (Coverage) updates automatically. Regular cover needed means at least one regular has no conflict recorded, not that they have confirmed availability. Outside substitute needed means a replacement is needed and no configured regular can cover. Once a non-conflicted substitute is assigned, the warning clears.

Administrators set Chairs.RegularPlayerIDs. If blank, the calendar uses EligiblePlayerIDs as the regular roster. Set an explicit regular roster when eligibility also includes outside substitutes; add the agreed substitute to Players and the eligible list, run Sync missing chair rows, then assign them.

The public calendar lists assigned and unavailable players together. Staffing can filter Needs cover or Outside substitute needed. Player filters and personal feeds still show assignments only; recording an unavailability conflict does not put that performance in the player’s calendar.

## For calendar administrators

- Create the show, players and chairs first. Enter Run Rules, then Pit Calendar → Preview run generation. Review before creating dates. Run Sync missing chair rows after adding performances manually; run Validate schedule after bulk changes.

- Edit dates and call/curtain/finish times in Performances. Preserve existing PerformanceIDs. Cancel with Status = Cancelled rather than deleting a performance. Publish a show only when its dates and roster are ready.

- Keep the workbook Restricted and share it with agreed musicians as Editors. Store each GoogleEmail once in Players. Chairs.EligiblePlayerIDs determines who can edit all assignments and conflicts for that chair, regardless of who is assigned. Administrators in Access can edit every chair across all shows. Run Apply chair permissions after email, eligibility or admin changes; run Sync missing chair rows after eligibility changes. Chairs.EditorEmails is calculated. File sharing is separate.

- Share this guide separately as Editor with each administrator who should maintain it. Keep general access as Anyone with the link → Viewer. Adding an administrator in the workbook does not automatically give them editing access to this guide.

If no dates appear, check Show, Player, Month and Staffing filters, then ask an administrator whether the show is published. If a protected cell blocks a legitimate change, check that you are using the correct Google account and ask an administrator to review chair access.

Calendar-app help: [Google Calendar](https://support.google.com/calendar/answer/37100) • [Apple Calendar](https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac) • [Outlook](https://support.microsoft.com/en-us/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web)



## Player names and IDs

Use a permanent FirstLast PlayerID with no spaces, such as MikeSmith, and a first-name DisplayName, such as Mike. Three Mikes can have different IDs and belong to different eligible-chair lists. The IDs—not the displayed names—identify assignments, accounts and feeds. If full names repeat, add a middle initial or numeric suffix. If two Mikes share one chair, use a last initial in their display labels. Keep existing IDs stable; changing one requires migrating references and replacing that player’s subscription URL.

New performances always create blank PlayerID / Open seats. A chair has no default player. Unclaimed seats appear in Needs cover; the regular-player pool only helps find coverage and never fills a seat automatically. Sync preserves existing assignments and the existing chair-tab layout while refreshing eligible-player and conflict validation.

## All-day notes and times not yet known

All-day notes appear above timed events. Time TBD explicitly means no start time has been supplied; it is not a midnight call. Multi-day notes appear on each included day. Bare notes do not create a musician assignment or personal subscription event.
