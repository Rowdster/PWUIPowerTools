# PWUIPowerTools
The default Playwright reports can benefit from some power tools for the end user

Playwright report default generation can be a bit challenging from a usability perspective, particularly when navigating through large test sets, screenshots, and more.

There is probably some method to inject this helper directy into the generated reports since it's just a simple set of JS. In the meantime, I'm using it as a TamperMonkey script.

The main goal is to provide a floating draggable helper screen and keyboard shortcuts. From the home page/top of the report, you will find a new widget like below.
<img width="2465" height="467" alt="image" src="https://github.com/user-attachments/assets/5a27b52e-eff1-4ad0-8e6a-3e70fc3cce5c" />

Sort Time will expand all the sub reports and order tests by execution time. 

When viewing a test, the helper changes out with new options like below.
<img width="2484" height="899" alt="image" src="https://github.com/user-attachments/assets/353364bb-d424-4242-bb93-373ca1648774" />

My personal favorite is "Screenshots" which jumps to the screenshots, which also acts as a sticky anchor when navigating forward and backward with the arrow keys. 
<img width="2439" height="872" alt="image" src="https://github.com/user-attachments/assets/35587f75-ac26-4c84-9a93-8e801265bfc9" />

Copy Link and Copy Test ID are great for quickly navigating to your own local instance of the site, or to share test ID information back to an AI chatbot. 

I hope you find this helpful!
