import React from "react";
import { Link } from "react-router-dom";
import "../styles/footer.css";

import vizIcon from "../assets/L1.png";
import flipspacesLogo from "../assets/FL LOGO.png";

export default function Footer() {
  return (
    <footer className="vwFooter">
      <div className="vwFooterContainer">
        {/* Top */}
        <div className="vwFooterTop">
          {/* Divider (full height) */}
          <div className="vwFooterDivider" aria-hidden="true" />

          {/* Left brand */}
          <div className="vwFooterBrand">
            {/* Logo redirects to home */}
            <Link to="/" className="vwFooterLogoLink" aria-label="Go to Home">
              <img className="vwFooterVizLogo" src={vizIcon} alt="Vizwalk" />
            </Link>

            <div className="vwFooterDesc">
              Next-generation architectural visualization platform. Brings your
              designs to life with stunning realism.
            </div>
          </div>

          {/* Right */}
          <div className="vwFooterRightBlock">
            <div className="vwFooterCol">
              <div className="vwFooterColTitle">PRODUCT</div>
              <a className="vwFooterLink" href="/features">Features</a>
              <a className="vwFooterLink" href="/gallery">Gallery</a>
              <a className="vwFooterLink" href="/updates">Updates</a>
            </div>

            <div className="vwFooterCol">
              <div className="vwFooterColTitle">RESOURCES</div>
              <a className="vwFooterLink" href="/docs">Documentation</a>
              <a className="vwFooterLink" href="/shortcuts">Shortcut Guide</a>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="vwFooterBottom">
          <div className="vwFooterBottomLeft" />

          <div className="vwFooterCopy">
            ©2026 Flipspaces. All Rights Reserved.
          </div>

          {/* ✅ Bottom-right Flipspaces logo link */}
          <div className="vwFooterRightBrand">
            <a
              className="vwFooterFlipLink"
              href="https://www.flipspaces.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Visit Flipspaces website"
              title="Visit Flipspaces"
            >
              <img
                className="vwFooterFlipLogo"
                src={flipspacesLogo}
                alt="Flipspaces"
              />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}