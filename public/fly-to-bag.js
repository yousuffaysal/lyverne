// ADD TO BAG on a phone: the piece travels to the bag, and you stay where you
// are.
//
// Opening the bag dialog was the old confirmation. On a phone that dialog is
// the whole screen, so adding a tee read as being taken somewhere else -- you
// lost the product you were looking at and had to find your way back. The
// garment flying into the bag icon says the same thing and costs you nothing.
//
// The flying copy is an ordinary fixed-position element on <body>, which is
// why a caller showing the product dialog has to close it first: a modal
// <dialog> sits in the browser's top layer, above every z-index there is, so
// nothing painted normally can cross it.

const PHONE = matchMedia('(max-width: 650px)');
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');

const bagIcon = () =>
  document.querySelector('.site-nav .bag-toggle') || document.querySelector('.bag-toggle');

// Where the piece starts, measured while the source is still on screen -- the
// caller is about to close the sheet it lives in. Returns null when the
// flight is not the right answer: on a desktop, for someone who asked for
// less motion, or when there is nothing to measure. The caller then falls
// back to opening the bag.
//
// The destination is deliberately NOT measured here. See flyToBag.
export function planFlight(source) {
  if (!PHONE.matches || REDUCED.matches) return null;
  if (!source || !bagIcon()) return null;
  const from = source.getBoundingClientRect();
  if (!from.width || !from.height) return null;
  return {src: source.currentSrc || source.src, from};
}

const nextFrame = () => new Promise(requestAnimationFrame);

export async function flyToBag(plan, {onArrive} = {}) {
  if (!plan) { onArrive?.(); return; }
  const {src, from} = plan;

  // A fixed layer that clips: a lone fixed element can widen the document and
  // put a scrollbar on the page for the length of the animation.
  const layer = document.createElement('div');
  layer.className = 'bag-flight-layer';
  layer.setAttribute('aria-hidden', 'true');

  // Two elements, because the curve is two separate movements: the track
  // carries the horizontal, the image carries the vertical. See below.
  const track = document.createElement('div');
  track.className = 'bag-flight-track';
  Object.assign(track.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });

  const ghost = document.createElement('img');
  ghost.className = 'bag-flight';
  ghost.src = src;
  ghost.alt = '';
  ghost.decoding = 'sync';

  track.append(ghost);
  layer.append(track);
  document.body.append(layer);

  // The destination is measured HERE, not at plan time. The caller has just
  // closed a modal, and the page puts its scroll position back a frame or two
  // afterwards -- which moves the nav, and with it the bag. Measured too
  // early, the piece flew to where the icon had been and left it behind.
  await nextFrame();
  await nextFrame();

  const icon = bagIcon();
  let target = icon?.getBoundingClientRect();
  // The nav scrolls away with the page, so on the home page the bag is usually
  // nowhere on screen by the time you add something. Flying at the corner
  // where it would have been left the piece vanishing into nothing, which is
  // not what was promised -- so a copy of the bag comes to meet it instead,
  // and leaves again once the piece is in.
  const onScreen = !!target && target.width > 0 &&
    target.bottom > 8 && target.top < innerHeight - 8 &&
    target.right > 8 && target.left < innerWidth - 8;
  const dock = onScreen ? null : showDock(icon);
  if (dock) target = dock.getBoundingClientRect();
  if (!target || !target.width) { layer.remove(); onArrive?.(); return; }

  const dx = (target.left + target.width / 2) - (from.left + from.width / 2);
  const dy = (target.top + target.height / 2) - (from.top + from.height / 2);
  const landing = target.width;
  // Land at roughly the icon's size rather than at nothing, so the piece
  // arrives instead of evaporating on the way.
  const end = Math.max(0.04, Math.min(0.4, (landing * 0.62) / from.width));
  const DURATION = 820;

  // The curve comes from giving each axis its own easing rather than from a
  // lifted midpoint. A midpoint above the straight line is the usual trick,
  // but the bag sits at the top of the screen: arcing further up pushed the
  // garment off the top edge, where the layer clipped it in half.
  //
  // Horizontal eases out, so the piece sets off across early. Vertical eases
  // in, so it climbs late and accelerates into the bag. Neither axis ever
  // overshoots its endpoints, so the flight cannot leave the screen -- and
  // the two together still read as one curve.
  track.animate(
    [{transform: 'translate3d(0,0,0)'}, {transform: `translate3d(${dx}px,0,0)`}],
    {duration: DURATION, easing: 'cubic-bezier(.22,.68,.3,1)', fill: 'forwards'});

  const flight = ghost.animate([
    // A small lift off the page first: the piece is picked up, then thrown.
    {transform: 'translate3d(0,0,0) scale(1)', opacity: 1, offset: 0},
    {transform: `translate3d(0,${dy * .05}px,0) scale(1.06)`, opacity: 1, offset: .15},
    {transform: `translate3d(0,${dy}px,0) scale(${end})`, opacity: .12, offset: 1},
  ], {duration: DURATION, easing: 'cubic-bezier(.5,.02,.66,.32)', fill: 'forwards'});

  await flight.finished.catch(() => {});   // a cancelled animation still cleans up
  layer.remove();
  // The count ticks over as the piece lands, not when the button was pressed.
  onArrive?.();

  if (dock) {
    const count = dock.querySelector('.bag-count');
    if (count) count.textContent = icon?.querySelector('.bag-count')?.textContent ?? count.textContent;
    pop(dock);
    const leaving = dock.animate(
      [{opacity: 1, transform: 'translateY(0)'}, {opacity: 0, transform: 'translateY(-14px)'}],
      {duration: 340, delay: 900, easing: 'cubic-bezier(.4,0,.7,.4)', fill: 'forwards'});
    leaving.finished.catch(() => {}).then(() => dock.remove());
    return;
  }
  if (icon) pop(icon);
}

// A stand-in for the real bag, borrowed from the nav so it cannot drift from
// it, parked in the corner for as long as the piece needs somewhere to land.
function showDock(icon) {
  if (!icon) return null;
  const dock = icon.cloneNode(true);
  dock.removeAttribute('id');
  dock.removeAttribute('aria-label');
  dock.setAttribute('aria-hidden', 'true');
  dock.tabIndex = -1;
  dock.disabled = true;
  dock.className = 'bag-flight-dock';
  document.body.append(dock);
  dock.animate(
    [{opacity: 0, transform: 'translateY(-14px) scale(.8)'}, {opacity: 1, transform: 'none'}],
    {duration: 300, easing: 'cubic-bezier(.34,1.4,.64,1)'});
  return dock;
}

// The bag takes the weight: a short overshoot on the icon, and a bigger one on
// the count, which is the number that just changed.
function pop(icon) {
  const spring = 'cubic-bezier(.34,1.56,.64,1)';
  icon.animate(
    [{transform: 'scale(1)'}, {transform: 'scale(1.2)', offset: .35}, {transform: 'scale(.97)', offset: .62}, {transform: 'scale(1)'}],
    {duration: 520, easing: spring});
  icon.querySelector('.bag-count')?.animate(
    [{transform: 'scale(1)'}, {transform: 'scale(1.55)', offset: .4}, {transform: 'scale(1)'}],
    {duration: 500, easing: spring});
}
