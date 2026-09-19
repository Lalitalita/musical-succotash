# GeoLite2 database

Place `GeoLite2-City.mmdb` in this directory to enable IP geolocation on the
security dashboard. MaxMind's license does not allow redistributing the
database, so it must be downloaded separately (free account required):

https://www.maxmind.com/en/geolite2/signup

Without this file, the dashboard still works but geolocation columns show
no data (private/loopback addresses are still labeled "Local").
