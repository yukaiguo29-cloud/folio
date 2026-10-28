import { describe, expect, it } from 'vitest';
import { ReadingNavigationService, type ReadingLocation } from '../src/core/reading-navigation';

function location(page: number, pane: ReadingLocation['pane'] = 'primary'): ReadingLocation {
  return { docId: pane === 'primary' ? 'one' : 'two', page, pane };
}

describe('ReadingNavigationService', () => {
  it('returns to the previous location and then moves forward again', () => {
    const service = new ReadingNavigationService();
    let current = location(10);
    service.register('primary', {
      getCurrent: () => current,
      activate: (next) => {
        current = next;
        return true;
      },
    });

    service.navigate(location(80));
    service.navigate(location(120));
    expect(service.state('primary')).toMatchObject({ canBack: true, canForward: false });
    service.back('primary');
    expect(current.page).toBe(80);
    service.back('primary');
    expect(current.page).toBe(10);
    service.forward('primary');
    expect(current.page).toBe(80);
  });

  it('deduplicates repeated targets and keeps panes independent', () => {
    const service = new ReadingNavigationService();
    let primary = location(1);
    let secondary = location(2, 'secondary');
    service.register('primary', { getCurrent: () => primary, activate: (next) => ((primary = next), true) });
    service.register('secondary', {
      getCurrent: () => secondary,
      activate: (next) => ((secondary = next), true),
    });

    service.navigate(location(3));
    service.navigate(location(3));
    service.navigate(location(4, 'secondary'), 'secondary');
    expect(service.state('primary').size).toBe(2);
    expect(service.state('secondary').size).toBe(2);
    expect(service.state('primary').canBack).toBe(true);
    expect(service.state('secondary').canBack).toBe(true);
  });

  it('limits history to the most recent 50 locations', () => {
    const service = new ReadingNavigationService();
    let current = location(1);
    service.register('primary', { getCurrent: () => current, activate: (next) => ((current = next), true) });
    for (let page = 2; page <= 60; page++) service.navigate(location(page));
    expect(service.state('primary').size).toBe(50);
    for (let i = 0; i < 49; i++) service.back('primary');
    expect(current.page).toBe(11);
  });
});
