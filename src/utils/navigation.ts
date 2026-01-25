/**
 * Navigation utilities for venue-aware routing
 */

/**
 * Get the venue home path for a given venue ID
 */
export const getVenueHomePath = (venueId: string) => `/venue/${venueId}`

/**
 * Get the venues list path
 */
export const getVenuesListPath = () => '/venues'

/**
 * Navigate back to venue home
 */
export const navigateToVenueHome = (navigate: (path: string) => void, venueId: string) => {
  navigate(getVenueHomePath(venueId))
}

/**
 * Navigate to venues list
 */
export const navigateToVenuesList = (navigate: (path: string) => void) => {
  navigate(getVenuesListPath())
}
