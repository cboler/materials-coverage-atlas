import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AtlasComponent } from './atlas/atlas.component';
import { FIXTURE } from './atlas/atlas-fixture';
import { StatusComponent } from './status/status.component';
import { routes } from './app.routes';

function mockFetch(response: Response) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);
}

describe('Application Tests', () => {
  beforeEach(async () => {
    mockFetch(new Response('not found', { status: 404 }));
    await TestBed.configureTestingModule({
      imports: [App, AtlasComponent, StatusComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  describe('App Shell', () => {
    it('should render the brand title', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.brand-title')?.textContent).toContain(
        'Materials Coverage Atlas',
      );
    });

    it('should render accessible navigation links and skip link', async () => {
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('#nav-link-home')?.textContent?.trim()).toBe('Atlas');
      expect(compiled.querySelector('#nav-link-status')?.textContent?.trim()).toBe('Status');
      expect(compiled.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
    });
  });

  describe('AtlasComponent', () => {
    it('should explain how to generate data when atlas.json is missing', async () => {
      const fixture = TestBed.createComponent(AtlasComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('#atlas-title')?.textContent).toContain('coverage atlas');
      expect(compiled.querySelector('#atlas-missing')?.textContent).toContain('build_atlas.py');
    });

    it('should render overlays, legend, anchors, coverage table and rules from data', async () => {
      vi.restoreAllMocks();
      mockFetch(new Response(JSON.stringify(FIXTURE), { status: 200 }));
      const fixture = TestBed.createComponent(AtlasComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      expect(compiled.querySelectorAll('.toolbar .chip')).toHaveLength(5);
      expect(compiled.querySelectorAll('.legend-item')).toHaveLength(5);
      expect(compiled.querySelector('.anchor-list')?.textContent).toContain('Corundum');
      expect(compiled.querySelectorAll('tbody tr')).toHaveLength(6);
      expect(compiled.querySelector('.rules')?.textContent).toContain('stiff');

      (compiled.querySelector('#overlay-elastic') as HTMLButtonElement).click();
      fixture.detectChanges();
      const labels = [...compiled.querySelectorAll('.legend-label')].map((e) => e.textContent);
      expect(labels).toEqual(['Has elastic data', 'No elastic data']);
    });

    it('should show the detail card when an anchor is selected', async () => {
      vi.restoreAllMocks();
      mockFetch(new Response(JSON.stringify(FIXTURE), { status: 200 }));
      const fixture = TestBed.createComponent(AtlasComponent);
      await fixture.whenStable();
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      (compiled.querySelector('.anchor-list .link-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(compiled.querySelector('#selected-detail')?.textContent).toContain('Al2O3');
    });
  });

  describe('StatusComponent', () => {
    it('should render base uri diagnostic', async () => {
      const fixture = TestBed.createComponent(StatusComponent);
      await fixture.whenStable();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('#status-heading')?.textContent).toContain(
        'Runtime & Routing Verification',
      );
      expect(compiled.querySelector('#base-uri-val')).toBeTruthy();
    });
  });
});
