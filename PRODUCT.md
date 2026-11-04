# Wedding Betting: Product Spec

| | |
|---|---|
| **Status** | Draft v1 |
| **Owner** | Abishek |
| **Last updated** | November 2, 2026 |
| **Audience** | Abishek, delegated admins, and anyone building the product |

## 1. Overview

Wedding Betting is a website that lets guests at Abishek's Indian wedding bet fictional money on what will happen during the celebrations. Every guest starts with $1,000. Guests place bets at odds set by the admin, and the admin decides which bets hit. A live leaderboard shows who has earned the most.

The product has two parts:

- **Admin Panel:** The private control hub for creating events, setting odds, viewing bets, and settling results.
- **Guest Panel:** The site guests use to view odds, place bets, and follow the leaderboard.

**No real money is involved.** Balances have no cash value, and guests cannot deposit, buy, withdraw, or transfer money.

## 2. Goals

### Product goals

1. Give guests a shared activity that runs throughout the wedding festivities.
2. Create friendly competition and inside jokes across both families and friend groups.
3. Let guests of any age or technical comfort level start betting in under one minute.
4. Keep the game fair and simple enough to run during the wedding.

### Non-goals

- Real-money gambling or redeemable credits
- Peer-to-peer bets between guests
- Parlays, live odds, or automated odds calculation
- Automatic detection of results
- Public access outside the wedding guest list

## 3. Users

| User | Needs | Design implication |
|---|---|---|
| **Admin (Abishek)** | Full control before and during the wedding | The panel must be fast and work well on a phone |
| **Delegated admin** | Run the game while the couple is busy | Needs clear lock and settlement tools, plus an activity log |
| **Casual guest** | Join quickly and understand each bet | Use plain language and minimal betting jargon |
| **Competitive guest** | Find the best odds and climb the leaderboard | Show live rank, balance, and bet history |
| **Older or less technical guest** | Participate without help | Use large tap targets, readable text, and no account setup |

## 4. Core Concepts

| Term | Definition |
|---|---|
| **Function** | A part of the wedding used to group events, such as Sangeet or Reception |
| **Event** | Something guests can bet on, such as "How late will the Baraat be?" |
| **Outcome** | A possible result of an event, each with its own odds |
| **Multiplier** | The odds for an outcome. A $100 bet at 3x pays $300 if it wins |
| **Stake** | The amount a guest puts on an outcome |
| **Payout** | The amount returned on a winning bet, equal to stake × multiplier |
| **Available balance** | The money a guest can currently bet |
| **Total balance** | Available balance plus stakes on bets that have not been settled |
| **Earnings** | Total balance minus the guest's starting amount and any admin adjustments |

## 5. Game Rules

### Bankroll

- Each guest starts with **$1,000** in fictional money.
- Bets use whole dollars, with a **$10 minimum**.
- A guest cannot bet more than their available balance.
- A guest who runs out of money stays on the leaderboard and can still view the game.

### Odds and payouts

- Admins set a multiplier above 1x for each outcome. It may have up to two decimal places.
- Guests see the multiplier and a plain-language payout, such as "Bet $100, win $300."
- The odds are locked into a bet when it is placed. Later odds changes affect new bets only.
- Payouts are rounded to the nearest whole dollar.

**Example:** A guest bets $100 at 3x.

| Result | Stake | Returned | Net change |
|---|---:|---:|---:|
| Won | $100 | $300 | +$200 |
| Lost | $100 | $0 | -$100 |
| Voided | $100 | $100 | $0 |

### Bet limits and changes

- A guest can have one bet per event.
- A guest can change or cancel that bet until the event locks.
- Once an event locks, the bet is final unless the admin voids or corrects the event.

### Event lifecycle

```text
Draft -> Open -> Locked -> Settled
                    |
                    v
                  Voided
```

| Status | Visible to guests? | Betting allowed? | Description |
|---|---|---:|---|
| **Draft** | No | No | Admin is preparing the event |
| **Open** | Yes | Yes | Guests can place, change, or cancel bets |
| **Locked** | Yes | No | Betting is closed and the result is pending |
| **Settled** | Yes | No | Winning outcome is confirmed and payouts are complete |
| **Voided** | Yes | No | Event is cancelled and all stakes are refunded |

An open event can also be voided. Events must lock **before** the result becomes known. Otherwise, guests in the room could bet on an outcome they just saw.

## 6. Guest Panel

### 6.1 Entry

1. Guest scans a QR code or opens the shared link.
2. Guest enters the wedding access code, if it was not included in the link.
3. Guest selects their name from the guest list.
4. First-time guest creates a 4-digit PIN.
5. Guest sees a short explanation of the game and lands on the event list.

There are no passwords, emails, or app downloads. Guests stay signed in on their device. If someone forgets their PIN, an admin can reset it.

### 6.2 Home

- Current balance, earnings, and leaderboard rank
- Open events, sorted by the soonest lock time
- Lock countdown when a lock time is set
- Filter by function
- Clear indication of which events the guest has already bet on

### 6.3 Event detail and bet slip

- Event question and short description
- Lock time and current status
- Each outcome with its multiplier
- Stake field with quick options such as $50, $100, and All in
- Live payout preview
- Review step before a bet is submitted

If the odds change while the bet slip is open, the guest sees the new odds and must confirm again.

### 6.4 My Bets

- Open bets
- Settled bets, marked Won, Lost, or Voided
- Stake, locked odds, potential payout, and final return
- Option to change or cancel a bet before the event locks

### 6.5 Leaderboard

- Ranks all guests by **earnings**
- Shows rank, display name, earnings, and total balance
- Highlights the current guest's position
- Updates shortly after a settlement
- Gives tied guests the same rank

Open bets count at their stake value, so placing a bet doesn't change a guest's rank. Rank changes only when a bet is settled or an admin adjusts a balance.

## 7. Admin Panel

### 7.1 Access

- Admin Panel is protected separately from the Guest Panel.
- Guests cannot reach admin pages or data.
- Abishek can give access to one or more delegated admins.
- Admin accounts cannot place bets.

### 7.2 Dashboard

- Number of guests who have joined
- Total bets and total money wagered
- Open events and upcoming lock times
- Locked events waiting for a result
- Quick actions to lock, settle, or view an event

### 7.3 Event management

Admins can:

- Create, edit, duplicate, reorder, and delete draft events
- Assign an event to a function
- Add two or more outcomes
- Set or change odds
- Set an optional automatic lock time
- Publish, lock, reopen, settle, or void an event
- Preview an event as guests will see it

Once an event has bets, its outcomes cannot be deleted. Admins can void the event instead.

### 7.4 Bet visibility

Admins can see every bet, filtered by event, guest, or status.

| Field | Description |
|---|---|
| Guest | Who placed the bet |
| Event | What they bet on |
| Outcome | Their selected result |
| Stake | Amount wagered |
| Locked odds | Multiplier at placement |
| Potential payout | Stake × locked odds |
| Status | Open, Won, Lost, or Voided |
| Time placed | Date and time |

Each event also shows total money and bet count per outcome, plus the potential payout if each outcome wins.

### 7.5 Settlement

1. Admin selects the winning outcome on a locked event.
2. The system shows the number of winners, number of losers, and total payout.
3. Admin confirms the result.
4. Winning bets are paid, losing bets close, and the leaderboard updates.

**Corrections:** If the wrong result was selected, an admin can reopen settlement. The system reverses the original payouts and then applies the corrected result. If a guest already spent the reversed winnings, their balance may go negative. They cannot bet again until it is positive.

### 7.6 Guest management

- Import or manually add the guest list
- Edit display names
- Reset a guest's PIN
- Deactivate a guest
- View a guest's balance and bet history
- Adjust a balance with a required reason

Admin adjustments change a guest's starting amount for scoring, so they don't count as earnings unless the admin chooses to make them a scored prize or penalty.

### 7.7 Game controls and activity log

- Pause all betting
- End the game and freeze the final leaderboard
- View a log of all admin actions, including who acted, what changed, and when

## 8. Example Event Ideas

These are placeholders to replace with the real wedding schedule and inside jokes.

| Function | Event | Example outcomes |
|---|---|---|
| Sangeet | Which side wins the dance-off? | Bride's side, Groom's side |
| Sangeet | Who is first on the dance floor? | Bride's family, Groom's family, Friends |
| Baraat | How late does the Baraat arrive? | On time, 1-15 min, 16-30 min, 31+ min |
| Baraat | How long does the Baraat last? | Under 20 min, 20-40 min, 40+ min |
| Ceremony | Who gets lifted highest during the garland exchange? | Bride, Groom, Tie |
| Ceremony | Who cries first? | Bride, Groom, A parent, Other |
| Ceremony | How much is paid to recover the groom's shoes? | Under $50, $50-$100, $101-$200, Over $200 |
| Reception | How long is the longest speech? | Under 3 min, 3-5 min, 6-10 min, Over 10 min |
| Reception | What song gets the biggest dance floor? | Admin-defined options |

### Content guidelines

- Keep every event friendly enough for all ages and both families.
- Avoid bets on alcohol consumption, arguments, health, or relationships.
- Get approval from anyone singled out by name.
- Write outcomes so that every possible result has a clear winner.

## 9. Requirements

### P0: Required for launch

**Guest**
- Join with a shared link or QR code
- Select a name and use a PIN
- View events, outcomes, and odds
- Place, change, and cancel bets
- View balance and bet history
- View the leaderboard

**Admin**
- Secure admin sign-in
- Guest-list management and PIN resets
- Event, outcome, and odds management
- Manual and scheduled event locking
- Full bet visibility
- Settlement, voiding, and corrections
- Delegated admin access
- Admin activity log

**System**
- Mobile-first responsive design
- Accurate balance and bet validation on the server
- Real-time or near-real-time updates
- Basic protection against duplicate submissions

### P1: Valuable after the core game works

- Full-screen leaderboard for a projector or reception screen
- Most Popular and Biggest Win highlights
- Guest-facing percentages showing how others bet
- Hindi or other language support
- Admin CSV export of guests, bets, and final results

### P2: Nice to have

- Achievement badges
- Team scoring for the bride's and groom's sides
- Push or SMS notifications
- Photos on event and outcome cards
- Post-wedding results recap

## 10. Quality Requirements

| Area | Requirement |
|---|---|
| **Accuracy** | Every balance change comes from a recorded transaction |
| **Concurrency** | Two simultaneous bets can't spend the same money, and bets after lock are rejected |
| **Performance** | Common guest screens feel fast on a phone, including during peak use |
| **Reliability** | The game must handle most guests joining and betting during the same window |
| **Connectivity** | The site must handle weak venue signal, with clear retry and failure messages |
| **Accessibility** | Use readable type, strong contrast, large tap targets, and labels that don't rely on color alone |
| **Security** | Admin actions are enforced on the server and can't be reached through guest access |
| **Privacy** | Collect only what the game needs. Keep the site out of search results |

A bet is confirmed only after the server accepts it. If the guest loses connection, the app must not show the bet as placed.

## 11. Edge Cases

| Scenario | Expected behavior |
|---|---|
| Guest places a bet exactly as an event locks | Server time decides, and a late bet is rejected with a clear message |
| Guest double-taps Place Bet | Only one bet is created |
| Odds change during bet review | Guest must confirm the new odds |
| Guest uses two devices | Both show the same balance, and server validation prevents overspending |
| Two people share a phone | The app offers an obvious Switch Guest option |
| Someone selects another guest's name | The PIN blocks access after that guest has claimed their name |
| Guest isn't on the list | Guest asks an admin to add them |
| Guest arrives late | Guest receives the normal $1,000 and can bet on open events |
| No one bets on the winner | Admin can still settle the event, and all bets lose |
| An event doesn't happen | Admin voids it and all stakes are refunded |
| The result is disputed | Admin decision is final, and any correction is logged |

## 12. Launch Plan

### Prelaunch

- [ ] Confirm the event list, odds, and lock times
- [ ] Load and review the guest list
- [ ] Add delegated admins and assign who runs each function
- [ ] Test on iPhone and Android, using poor-connection conditions
- [ ] Run a full test with friends, including a settlement and correction
- [ ] Reset all test data
- [ ] Print QR codes and prepare announcement copy

### During the wedding

1. Share the link and QR code before the first function.
2. Publish events by function.
3. Lock each event before its result can be known.
4. Settle results soon after they are confirmed.
5. Announce standings at chosen moments.
6. End the game and freeze the final leaderboard.

## 13. Success Measures

- At least 70% of invited guests join the game
- At least 50% of joined guests place three or more bets
- Most guests join without needing help
- All bets settle correctly, with no unresolved balance issues
- The admin can settle a typical event in under one minute

## 14. Open Decisions

Items with a default can stay as written unless Abishek wants to change them.

| # | Decision | Default in this spec |
|---|---|---|
| 1 | What are the wedding dates and final function schedule? | **Needed** |
| 2 | How many guests are expected? | **Needed** |
| 3 | Who will act as delegated admins? | **Needed** |
| 4 | Will the winner receive a prize? | No prize |
| 5 | Should couples play together or individually? | Individually |
| 6 | Can children play? | Admin decides by guest list |
| 7 | Should guests see how others bet? | Admin only at launch |
| 8 | Should leaderboard ranking use earnings or total balance? | Earnings |
| 9 | Should bets be limited to one per event? | Yes |
| 10 | Should there be a maximum bet? | No, available balance is the limit |
| 11 | Should all guests share one access code? | Yes |
| 12 | What should the product be called? | Wedding Betting |
| 13 | What should the visual theme be? | **Decided:** creams and forest green |
