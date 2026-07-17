# Projet : Ligue Mondiale de Coureurs (nom provisoire)

## Vision produit

Une plateforme qui transforme la course à pied individuelle en compétition collective par pays, façon "ligue sportive" (esprit Zwift Racing League + identité nationale). Les coureurs connectent leur compte Strava, leurs activités alimentent le score de leur pays, et les pays s'affrontent en saisons de plusieurs semaines avec système de divisions et promotion/relégation.

**Positionnement clé : inclusif, pas élitiste.** Le scoring ne doit jamais favoriser uniquement les coureurs les plus rapides ou les plus gros volumes. L'objectif est que débutants et confirmés puissent contribuer de façon significative au score de leur pays. Toute évolution du scoring doit être vérifiée contre ce principe.

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

### country_scores
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| country_code | text | |
| season_id | uuid (FK seasons) | |
| week_start_date | date | |
| total_points | numeric | somme des weekly_scores des users du pays |
| active_runners_count | int | nombre de coureurs ayant scoré cette semaine |
| division | text | Division A/B/C, déterminée à chaque saison |

### seasons
| Champ | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| season_number | int | |
| start_date | date | |
| end_date | date | 4 semaines après start_date |
| status | text | upcoming / active / completed |

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

## Logique de ligues (par pays)

- Round = 1 semaine (lundi 00:00:00 UTC → dimanche 23:59:59 UTC)
- Saison = 4 rounds (4 semaines)
- Score pays = somme des total_points de tous les coureurs inscrits de ce pays sur la semaine (pas une moyenne — incite chaque pays à recruter davantage de coureurs)
- Divisions, recalculées au début de chaque saison selon le nombre de coureurs actifs (ayant scoré au moins 1 activité dans les 4 dernières semaines) :
  - Division A : 200+ coureurs actifs
  - Division B : 50-199 coureurs actifs
  - Division C : moins de 50 coureurs actifs
- Promotion / relégation : à la fin de chaque saison, les 2 meilleurs pays de chaque division montent d'une division, les 2 derniers descendent (sauf Division A qui n'a personne au-dessus, et Division C qui n'a personne en dessous)

## Priorités de développement (sprints)

1. Sprint 1 : Auth Supabase + connexion OAuth Strava + stockage des tokens
2. Sprint 2 : Réception des activités via Strava Webhooks, stockage dans activities, filtres anti-triche
3. Sprint 3 : Calcul du scoring hebdomadaire (weekly_scores), agrégation par pays (country_scores)
4. Sprint 4 : Interface publique de classement (par division, par pays), page profil utilisateur avec historique de points

## Décisions déjà prises (ne pas remettre en question sans discussion explicite)

- Priorité au lancement : ligues par pays, pas par ville (masse critique insuffisante par ville au démarrage — la ville sera une V2 une fois un pays > 500 coureurs actifs)
- Le scoring ne doit jamais valoriser la vitesse absolue brute (favorise les élites, contraire au positionnement inclusif) — uniquement la progression individuelle relative
- Monétisation non traitée à ce stade — focus exclusif sur le fonctionnement produit
