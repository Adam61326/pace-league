# Projet : Ligue Mondiale de Coureurs (nom provisoire)

## Vision produit

Une plateforme qui transforme la course à pied individuelle en compétition, façon "ligue sportive" (esprit Zwift Racing League). Les coureurs connectent leur compte Strava, leurs activités alimentent un score hebdomadaire individuel, et chaque coureur progresse dans un système de paliers (Bronze III → Legend) au sein de cohortes hebdomadaires d'une trentaine de joueurs de niveau comparable, avec promotion/relégation (**Sprint 13** — remplace l'ancien mécanisme de compétition par pays, voir "Logique de ligues par pays (dépréciée Sprint 13)" ci-dessous). L'identité nationale reste présente (drapeau sur le profil, classement individuel filtrable par pays), mais n'est plus le moteur de la compétition.

**Positionnement clé : inclusif, pas élitiste.** Le scoring ne doit jamais favoriser uniquement les coureurs les plus rapides ou les plus gros volumes. L'objectif est que débutants et confirmés puissent contribuer de façon significative à leur propre progression. Le système de paliers renforce ce principe : chaque coureur est comparé à une cohorte de niveau proche, pas au reste du monde. Toute évolution du scoring doit être vérifiée contre ce principe.

## Stack technique

- **Frontend** : Next.js (React), déployé sur Vercel
- **Backend / Base de données** : Supabase (Postgres + Auth)
- **Données activités** : API Strava (OAuth2 + Webhooks — pas de polling)
- **Hébergement** : Vercel (front) + Supabase (data), tiers gratuits au démarrage

## Authentification & connexion Strava

- L'utilisateur crée un compte (email/password ou OAuth Supabase Auth)
- L'utilisateur connecte son compte Strava via OAuth2 (scope lecture activités uniquement)
- Stocker access_token, refresh_token, expires_at par utilisateur (chiffrés)
- Utiliser les Strava Webhooks (event push) pour capter chaque nouvelle activité en temps réel, plutôt que de repoller l'API (limite gratuite : 100 requêtes/15min, 1000/jour — critique à ne pas dépasser)
- Un seul "Authorization Callback Domain" autorisé par app Strava en gratuit → fixer le domaine définitif avant de créer l'app développeur Strava

## Schéma de données (Supabase / Postgres)

### users
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| email | text | |
| country_code | text | déclaré à l'inscription (ISO 3166-1 alpha-2) |
| strava_athlete_id | text | |
| strava_access_token | text | chiffré |
| strava_refresh_token | text | chiffré |
| strava_token_expires_at | timestamptz | |
| created_at | timestamptz | |

### activities
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK users) | |
| strava_activity_id | text | unique, évite les doublons |
| distance_km | numeric | |
| moving_time_seconds | int | |
| avg_speed_kmh | numeric | calculé |
| has_gps | boolean | activités manuelles sans GPS exclues du scoring |
| activity_date | date | date locale de l'activité |
| created_at | timestamptz | |

### weekly_scores
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK users) | |
| week_start_date | date | lundi 00:00 UTC |
| base_points | numeric | points participation + distance |
| progression_bonus | numeric | bonus vitesse relative |
| regularity_bonus | numeric | bonus jours distincts |
| total_points | numeric | somme |

### country_scores (dépréciée Sprint 13, voir "Logique de ligues par pays" ci-dessous)
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| country_code | text | |
| season_id | uuid (FK seasons) | |
| week_start_date | date | |
| total_points | numeric | somme des weekly_scores des users du pays |
| active_runners_count | int | nombre de coureurs ayant scoré cette semaine |
| division | text | Division A/B/C, déterminée à chaque saison |

Table et calcul (`lib/scoring.ts` `computeCountryScores`) conservés et toujours alimentés par le cron nocturne pour ne pas perdre l'historique, mais plus aucune page ne les affiche depuis Sprint 13.

### seasons
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| season_number | int | |
| start_date | date | |
| end_date | date | 12 semaines après start_date (4 avant Sprint 13) |
| status | text | upcoming / active / completed |

### player_tiers (Sprint 13)
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | uuid (FK users, unique) | |
| tier | text | bronze_3 → legend, voir "Logique de progression individuelle par paliers" |
| updated_at | timestamptz | mis à jour à chaque mouvement de palier |

Un nouvel utilisateur démarre à `bronze_3` (créé automatiquement par le trigger `handle_new_user`).

### tier_cohorts (Sprint 13)
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| tier | text | palier de la cohorte |
| week_start_date | date | |
| movements_applied | boolean | true une fois la promotion/relégation de la semaine appliquée (verrou anti-double-application) |

### cohort_members (Sprint 13)
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| cohort_id | uuid (FK tier_cohorts) | |
| user_id | uuid (FK users) | |
| week_points | numeric | total_points de weekly_scores pour cette semaine |
| rank | int | rang dans la cohorte |
| movement | text | promoted / relegated / stable |

Depuis Sprint 14, `tier_cohorts` a une colonne `member_count` (dénormalisée à la création de la cohorte) : évite de recompter les membres à chaque vérification de badge "victoire hebdo"/"podiums".

### badges / user_badges (Sprint 14)
| Table | Champs clés | Notes |
|---|---|---|
| badges | key (PK), category, label, description, threshold_value, threshold_unit | Catalogue fixe, seedé par migration. Catégories : distance, dplus, regularity, performance. |
| user_badges | user_id (FK), badge_key (FK badges), earned_at, unique(user_id, badge_key) | Idempotent (upsert ignorant les doublons) — vérifié à chaque recalcul du cron (lib/badges.ts). |

Seuils : Distance cumulée (5, 10, 21.1, 42.2, 100, 500, 1000, 5000, 10000 km), D+ cumulé (1000, 5000, 10000, 50000, 100000 m), Régularité (streak de 7, 30, 100, 365 jours, réutilise `lib/streak.ts`), Performance (top 1000 monde / top 100 France / top 10 France sur le classement individuel d'une semaine donnée, victoire hebdo = 1er de cohorte, 10 et 50 podiums cumulés = top 3 de cohorte).

**Décision non spécifiée à l'origine, tranchée à l'implémentation** : "victoire hebdo" et "podiums cumulés" ne sont comptés que pour une cohorte d'au moins 10 joueurs actifs cette semaine-là (même seuil `MIN_COHORT_SIZE_FOR_MOVEMENT` que la promotion/relégation, "Logique de progression individuelle par paliers" ci-dessus) — gagner dans une cohorte de 1 ou 2 joueurs n'est pas une vraie victoire. Les badges "top France/monde" ne sont eux pas soumis à ce seuil : ils comparent au classement individuel complet, pas à la cohorte.

**Tension avec le positionnement inclusif** (Vision produit ci-dessus) : les badges "top France/monde" et le Hall of Fame (voir ci-dessous) valorisent le classement brut (vitesse/volume), contrairement au principe "le scoring ne doit jamais favoriser les plus rapides/gros volumes". Ce sont des trophées cosmétiques greffés sur des données déjà calculées, pas une évolution du scoring lui-même (qui reste inchangé), mais le signal mérite d'être gardé en tête si le positionnement inclusif doit rester strictement cohérent sur toutes les surfaces du produit.

### hall_of_fame (Sprint 14)
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| week_start_date | date | |
| rank | int (1-3) | |
| user_id | uuid (FK users) | |
| total_points | numeric | |

Top 3 mondial (tous paliers confondus) par `total_points` de `weekly_scores`, archivé une fois la semaine terminée. Page publique `/hall-of-fame` (comme le classement mondial, pas de connexion requise). Figé définitivement une fois écrit — même logique que `tier_cohorts.movements_applied` : jamais recalculé rétroactivement, même si des données arrivent en retard.

### users.share_token (Sprint 14)
Colonne `uuid unique` ajoutée à `users`, générée automatiquement (`gen_random_uuid()`). Identifiant opaque pour `/api/weekly-card/[token]` (carte hebdomadaire partageable, générée via `next/og` `ImageResponse`) — distinct du `user_id` brut pour qu'on ne puisse pas deviner/scraper les cartes d'autres utilisateurs.

## Logique de scoring (par activité individuelle)

Filtres anti-triche (appliqués avant tout calcul) :
- Exclure les activités sans trace GPS (has_gps = false)
- Exclure les activités avec avg_speed_kmh > 22 (vitesse jugée non plausible en course à pied grand public)
- Maximum 1 activité comptée par jour par utilisateur (la meilleure si plusieurs)

Points de base :
- 10 points de participation par activité valide
- 1 point par km parcouru, plafonné à 25 km/activité (au-delà de 25km, pas de points supplémentaires)

Bonus progression vitesse (remplace un bonus vitesse absolue, pour rester inclusif) :
- Calculer l'allure de référence de l'utilisateur = moyenne mobile de son allure sur les 4 dernières semaines glissantes
- Si un nouvel utilisateur n'a pas 4 semaines d'historique : pas de bonus vitesse pendant sa période de constitution de référence
- Si l'allure du jour est meilleure que l'allure de référence : bonus = +1 point par tranche de 2% d'amélioration, plafonné à +15 points par activité
- Formule : amelioration_pct = (allure_reference - allure_du_jour) / allure_reference * 100
- bonus = min(15, floor(amelioration_pct / 2)) si amelioration_pct > 0, sinon 0

Bonus régularité (calculé en fin de semaine, par utilisateur) :
- +20 points si l'utilisateur a couru sur au moins 3 jours distincts dans la semaine
- +40 points si 5 jours distincts ou plus (ce bonus remplace le précédent, pas cumulatif)

## Logique de ligues par pays (dépréciée Sprint 13)

> Remplacée par la "Logique de progression individuelle par paliers" ci-dessous. Conservée ici pour référence — le code correspondant n'est pas supprimé, juste déplacé/commenté comme déprécié (`lib/scoring.ts` `computeCountryScores`, page déplacée dans `app/(authenticated)/_deprecated/ligues-pays/`) au cas où ce mécanisme reviendrait un jour.

- Round = 1 semaine (lundi 00:00:00 UTC → dimanche 23:59:59 UTC)
- Saison = 4 rounds (4 semaines)
- Score pays = somme des total_points de tous les coureurs inscrits de ce pays sur la semaine (pas une moyenne — incite chaque pays à recruter davantage de coureurs)
- Divisions, recalculées au début de chaque saison selon le nombre de coureurs actifs (ayant scoré au moins 1 activité dans les 4 dernières semaines) :
  - Division A : 200+ coureurs actifs
  - Division B : 50-199 coureurs actifs
  - Division C : moins de 50 coureurs actifs
- Promotion / relégation : à la fin de chaque saison, les 2 meilleurs pays de chaque division montent d'une division, les 2 derniers descendent (sauf Division A qui n'a personne au-dessus, et Division C qui n'a personne en dessous)

## Logique de progression individuelle par paliers (Sprint 13)

Remplace le mécanisme de compétition par pays ci-dessus. Douze paliers, du plus bas au plus haut : `bronze_3, bronze_2, bronze_1, silver_3, silver_2, silver_1, gold_3, gold_2, gold_1, diamond, master, legend`. Un nouvel utilisateur démarre à `bronze_3`.

- Round = 1 semaine (lundi 00:00:00 UTC → dimanche 23:59:59 UTC)
- Saison = 12 rounds (12 semaines, depuis Sprint 13 — 4 semaines auparavant)
- Chaque semaine, pour chaque palier, les joueurs actifs (ayant scoré au moins 1 point de `weekly_scores` cette semaine) sont répartis en cohortes d'environ 30, par tranches déterministes triées par `user_id` (pas par score : la répartition ne doit pas favoriser artificiellement qui que ce soit)
- Chaque cohorte est classée par `total_points` de la semaine (`weekly_scores`, même calcul individuel que les autres niveaux — aucune nouvelle logique de scoring)
- Top 5 de la cohorte : promotion au palier supérieur (aucun effet en Legend, palier maximum)
- Bottom 5 de la cohorte : relégation au palier inférieur (aucun effet en Bronze III, palier minimum)
- **Exception non spécifiée à l'origine, tranchée à l'implémentation** : si une cohorte compte moins de 10 joueurs actifs cette semaine, aucun mouvement n'est appliqué (en dessous de ce seuil, les zones top 5 et bottom 5 se chevauchent et promouvraient/relégueraient les mêmes personnes)
- Le mouvement d'une semaine n'est appliqué qu'une seule fois, dès que la semaine est terminée (verrouillé par `tier_cohorts.movements_applied`) — le cron recalculant les 4 dernières semaines chaque nuit ne doit jamais rejouer un mouvement déjà appliqué
- Affiché sur `/ligues` : cohorte actuelle de l'utilisateur, badge de palier, zones de promotion (vert) / relégation (rouge)

## Architecture produit : trois niveaux de classement

Le produit s'organise en trois niveaux emboîtés. Les trois partagent le même calcul individuel (`weekly_scores`) : aucune nouvelle logique de scoring n'est introduite d'un niveau à l'autre, seuls le filtrage et l'agrégation changent.

1. **Niveau Monde (fait, Sprint 3)** — classement individuel mondial, tous pays confondus (`/classement`, scope "monde").
2. **Niveau Pays (fait, Sprint 4)** — classement individuel filtré par pays (`/classement`, scope "pays"). Le volet "ligues de pays avec divisions A/B/C" qui complétait ce niveau est déprécié depuis Sprint 13 (voir "Logique de ligues par pays (dépréciée Sprint 13)") ; le filtre par pays du classement individuel, lui, n'est pas affecté.
3. **Niveau Ligues privées (fait, Sprint 5)** — ligues créées par un utilisateur, rejointes par un code à 6 caractères, avec un classement individuel filtré aux seuls membres de la ligue. Réutilise tel quel le calcul `weekly_scores` existant : aucune nouvelle logique de scoring, juste un filtre supplémentaire sur l'appartenance à la ligue.

En parallèle de ces trois niveaux de classement, **la progression individuelle par paliers (Sprint 13, voir ci-dessus)** est le mécanisme de compétition principal sur `/ligues` : elle n'est filtrée ni par pays ni par ligue privée, seulement par palier.

## Priorités de développement (sprints)

1. Sprint 1 : Auth Supabase + connexion OAuth Strava + stockage des tokens
2. Sprint 2 : Réception des activités via Strava Webhooks, stockage dans activities, filtres anti-triche
3. Sprint 3 : Calcul du scoring hebdomadaire (weekly_scores), agrégation par pays (country_scores)
4. Sprint 4 : Interface publique de classement (par division, par pays), page profil utilisateur avec historique de points
5. Sprint 5 : Ligues privées — table `leagues` (id, name, code, created_by, created_at), table `league_members` (league_id, user_id, joined_at), page de création/jointure par code, page de classement filtré par ligue
6. Sprint 13 : remplacement des ligues par pays (divisions A/B/C) par une progression individuelle par paliers (Bronze → Legend, cohortes hebdomadaires de ~30 joueurs), saisons passées à 12 semaines, récupération automatique de l'historique Strava des 4 dernières semaines à la connexion
7. Sprint 14 : badges (distance/D+/régularité/performance), rivaux dans la cohorte (dashboard), Hall of Fame public (top 3 mondial hebdomadaire archivé), cartes hebdomadaires partageables (`next/og`, token opaque)

## Décisions déjà prises (ne pas remettre en question sans discussion explicite)

- **Sprint 13** : le mécanisme de compétition principal n'est plus la ligue par pays (divisions A/B/C) mais la progression individuelle par paliers (cohortes hebdomadaires de ~30 joueurs de niveau comparable, promotion/relégation top5/bottom5) — voir "Logique de progression individuelle par paliers". Le country_code des utilisateurs reste utile ailleurs (drapeau profil, filtre pays du classement individuel) et n'est pas remis en cause par ce changement.
- Le scoring ne doit jamais valoriser la vitesse absolue brute (favorise les élites, contraire au positionnement inclusif) — uniquement la progression individuelle relative
- Monétisation non traitée à ce stade — focus exclusif sur le fonctionnement produit
