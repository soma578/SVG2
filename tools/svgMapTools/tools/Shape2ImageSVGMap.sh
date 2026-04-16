#!/bin/bash
java -Djava.awt.headless=true -Djava.util.prefs.userRoot="${TMPDIR:-/tmp}/svgmaptools-prefs" -Xmx800m -classpath "../target/*:../target/dependency/*" org.svgmap.shape2svgmap.MainWrapper Shape2ImageSVGMap "$@"
