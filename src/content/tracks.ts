/**
 * Learning tracks. Each track has its own manifest (outline + weights + exam shape), content files and progress rows;
 * progress is keyed by content ids, so switching tracks never touches the other track's progress.
 * Track data comes from the content repository (`content.tracks`); switching is done with `setActiveTrackId`.
 */
export { getActiveTrackId, setActiveTrackId } from './index';
