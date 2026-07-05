import './CoverBPM.css';

// Cover slide implemented from Figma (V2 Design System · BPM · Lowcode, node 1:5).
// Semantic flex layout; all colors/fonts bound to design tokens (see CoverBPM.css).
export function CoverBPM() {
  return (
    <div className="cover">
      <span className="cover__badge">NEW</span>

      <h1 className="cover__title">
        <span>Design System</span>
        <span className="cover__title--sub">- BPM - Lowcode V2</span>
      </h1>

      <div className="cover__footer">
        <div className="cover__meta">
          <div className="cover__credits">
            <span>Onshore: Yilan</span>
            <span>Offshore: Vikee &amp; Cynthia</span>
          </div>
          <span className="cover__date">July 2023</span>
        </div>
        <span className="cover__status">In Progress</span>
      </div>
    </div>
  );
}
